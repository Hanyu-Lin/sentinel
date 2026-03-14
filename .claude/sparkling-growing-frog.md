# Plan: Sentinel — Phased Implementation

> Source PRD: /Users/linhanyu/Workspace/Projects/sentinel/sentinel-prd.md
> Working directory: /Users/linhanyu/Workspace/Projects/sentinel

---

## Architectural decisions

Durable decisions that apply across all phases:

- **Ultimate target**: Electron desktop app (`apps/desktop`, Phase 2). All Phase 1 decisions are made to accommodate this — the web app is the renderer, the server is a child process managed by Electron main. No Phase 1 work needs rework for Phase 2 desktop.
- **Monorepo package plan**: `apps/web` (React renderer), `apps/server` (Effect-TS backend), `apps/desktop` (Electron shell, scaffolded empty in Phase 1), `packages/contracts`, `packages/analyzer`, `packages/shared`, `packages/reviewer` (empty stub Phase 1)
- **Routes**: `/` (graph canvas + live session), `/settings`, `/diff` (git diff mode) — same routes work in browser (Phase 1) and Electron `BrowserWindow` (Phase 2)
- **WebSocket URL**: `ws://localhost:<port>/ws` — same in browser and Electron renderer
- **Schema source of truth**: `packages/contracts` — all WS messages validated via Zod on both sides
- **Server runtime**: Effect-TS (`NodeRuntime.runMain`) with layers: `ConfigService`, `HttpService`, `WsService`, `WatcherService`, `AnalyzerService`, `SessionService`
- **Graph data model**: Graphology — canonical instance lives in server memory; client holds its own Graphology instance synced via diffs
- **Persistence**: `bun:sqlite` in `apps/server` for session history only; layout positions stored in `localStorage` (Phase 1) / Electron `app.getPath('userData')` (Phase 2)
- **Layout**: ForceAtlas2 in Web Worker (`graphology-layout-forceatlas2`); Noverlap anti-overlap pass after initial index and diffs adding >5 nodes
- **Client state**: Zustand v5 — holds Graphology instance, active blast radius node sets (downstream/upstream/changed), pinned nodes, hover node, directory filter, diff mode state, session summary, timeline events, focusMode
- **Key node attributes**: `baseColor` (directory, permanent), `eventColor` (change state, null when inactive), `visible` (boolean), `opacity` (float), `inDegree` (int), `pinned` (boolean)
- **Component library**: shadcn/ui (built on **@base-ui/react** `^1.2.0`, matching t3code). Install components via `bunx shadcn add <component>` — never copy component files manually. Style: `base-mira`, icon library: `lucide-react`, base color: `zinc`, Tailwind v4 CSS variables.
- **Debounce window**: 500ms (chokidar file watcher batching)
- **focusMode default**: `"hide"` (non-blast-radius nodes removed from canvas)
- **blastRadiusDirection default**: `"downstream"`
- **Config file**: `.sentinelrc` (JSON with comments); never overwritten — only new entries appended

### Native CLI tooling policy

Prefer native CLI scaffolding over manually writing files. This keeps generated boilerplate consistent and reduces drift:

| Task | CLI command |
|---|---|
| Add shadcn component | `bunx shadcn add <component>` |
| Add new web app | `bun create vite apps/web` |
| Add new Electron app (Phase 2) | `bun create electron-vite apps/desktop` or `bunx create-electron-app` |
| Add TanStack Router routes | `bunx tsr generate` (file-based routing codegen) |
| Add shadcn/ui to a new app | `bunx shadcn init` in the app directory |

---

## Phase 1: Contracts foundation

**User stories**: schema contract tests (testing decisions section), all WS message types

### What to build

Fix all schema gaps in `packages/contracts` so downstream packages have a correct, complete type surface to build against. Add schema tests.

**Gaps to fix:**

`packages/contracts/src/graph.ts`:
- `GraphDiff.blastRadius` → `{ downstream: string[], upstream: string[], changedNodeIds: string[] }` (replace flat `affectedNodeIds`)
- Add `newCircularDeps: CircularDep[]` to `GraphDiff`
- Add `resolvedCircularDeps: string[]` (cycle IDs) to `GraphDiff`
- Add `CircularDep` schema: `{ id: string, cycleNodeIds: string[] }`

`packages/contracts/src/ws.ts`:
- `session.changeEvent` payload: `filePaths: string[]` (array, not single), `blastRadius: { downstream: number, upstream: number }`
- Replace `pin.node` with `node.togglePin: { nodeId: string }`
- Add `session.reset` to server→client message union (no payload)
- `graph.snapshot` payload: add `sessionHistory: SessionEvent[]`, `activeCircularDeps: CircularDep[]`

`packages/contracts/src/blastRadius.ts`:
- Replace flat `affectedNodeIds` with `{ downstream: string[], upstream: string[], changedNodeIds: string[] }`

Add `packages/contracts/src/session.ts`: `SessionEvent` schema (filePaths, eventTypes, blastRadiusCounts, timestamp, id).

Add `packages/analyzer/package.json` dependency: `graphology-traversal` (replace `graphology-shortest-path` for BFS).

### Acceptance criteria

- [ ] `GraphDiff` Zod schema validates with `newCircularDeps`, `resolvedCircularDeps`, and directional `blastRadius`
- [ ] `session.reset` is a valid server→client message
- [ ] `node.togglePin` replaces `pin.node` in client→server union
- [ ] `graph.snapshot` schema includes `sessionHistory` and `activeCircularDeps`
- [ ] `session.changeEvent` uses `filePaths: string[]`
- [ ] Schema tests: valid inputs parse, invalid inputs reject with correct error shapes
- [ ] Round-trip test: serialize any valid WS message to JSON and parse back, assert structural equality
- [ ] `bun run typecheck` passes across the monorepo

---

## Phase 2: Analyzer core

**User stories**: #9 (dependency graph), #37 (circular dep detection), analyzer testing decisions

### What to build

Implement the three stub functions in `packages/analyzer` end-to-end so the graph pipeline has a working engine.

**`buildGraph.ts`**: Call `dependency-cruiser` programmatically on a target directory, parse the JSON output into a Graphology `DirectedGraph`. Each node = a file path (relative to repo root). Each edge = a directed import. Compute `inDegree` per node. Classify edges as `intra-directory` vs `cross-directory`. Respect `.sentinelrc` exclude patterns passed as config. Resolve TypeScript path aliases from `tsconfig.json` by passing tsconfig path to dependency-cruiser's `tsConfig` option.

**`diffGraphs.ts`**: Given `previousGraph` and `currentGraph` (both Graphology instances), produce a `GraphDiff`. Compare node sets for `addedNodes`, `removedNodes`, `modifiedNodes`. Compare edge sets for `addedEdges`, `removedEdges`. Run SCC (strongly-connected-components) on both graphs to produce `newCircularDeps` and `resolvedCircularDeps`.

**`blastRadius.ts`**: Given a `DirectedGraph`, a set of changed node IDs, and a direction (`"downstream" | "both"`), run BFS using `graphology-traversal`'s `bfsFromNode`. Collect all reachable nodes following outbound edges (downstream). If direction is `"both"`, run a second BFS on the reversed graph for upstream. Return `{ downstream, upstream, changedNodeIds }` with no duplicates.

Expose a single `analyze(targetDir, config, previousGraph?)` function from `src/index.ts` that orchestrates the full pipeline and returns `{ graph: DirectedGraph, diff: GraphDiff | null }`.

### Acceptance criteria

- [ ] Given TypeScript fixture files with known imports, `buildGraph` returns correct nodes and edges
- [ ] TypeScript path aliases from `tsconfig.json` are correctly resolved
- [ ] Excluded files (matching `.sentinelrc` patterns) do not appear in the graph
- [ ] `diffGraphs` correctly identifies added, removed, and modified nodes/edges between two graph snapshots
- [ ] `diffGraphs` detects new circular dependencies and places them in `newCircularDeps`
- [ ] `diffGraphs` detects resolved circular dependencies and places them in `resolvedCircularDeps`
- [ ] Blast radius BFS with `"downstream"` returns all transitively downstream nodes and no upstream nodes
- [ ] Blast radius BFS with `"both"` returns separate downstream and upstream arrays; a node reachable both ways appears in both
- [ ] Multiple changed nodes produce a blast radius that is the union with no duplicates
- [ ] In-degree is correctly computed and updates when edges change
- [ ] File deletion: node in `removedNodes`, dangling edges in `removedEdges`
- [ ] File creation: node in `addedNodes`, outbound edges in `addedEdges`
- [ ] `bun run test` passes in `packages/analyzer`

---

## Phase 3: Effect server bootstrap

**User stories**: #4 (browser opens automatically), #8 (status indicator)

### What to build

Wire up the Effect-TS runtime in `apps/server` so there is a running HTTP server serving static files (the built web app) and a health endpoint. No file watching or WebSocket yet — just the skeleton that all later phases plug into.

**Effect layers to create:**

`ConfigService` — reads `.sentinelrc` + CLI args (target repo path, port). Exposes typed config via `Effect.ServiceMap.Service`.

`HttpService` — Hono (or Node `http.createServer`) wrapped in a `Layer.scoped` resource. Serves `dist/client` as static files. `GET /health` returns `{ status: "ok" }`. On startup, calls `open` (or `openurl`) to launch the browser automatically.

Entry point `src/index.ts` uses `NodeRuntime.runMain` with `Layer.provideMerge` to compose: `HttpService.Live` + `ConfigService.Live`.

**Pattern reference** (from t3code):
- `ServiceMap.Service<Tag, Shape>()(key)` for service tags
- `Layer.effect(Tag, ...)` for effectful construction
- `Layer.scoped` for resources with `finalizer` (e.g., `Effect.addFinalizer(() => Effect.sync(() => server.close()))`)
- `NodeRuntime.runMain(program.pipe(Effect.provide(AppLayer)))` as entry point

### Acceptance criteria

- [ ] `bun run dev` in `apps/server` starts without crashing
- [ ] `GET /health` returns `{ status: "ok" }` with 200
- [ ] `GET /` serves the web app's `index.html` (after `bun run build` in `apps/web`)
- [ ] Server shuts down cleanly (no hanging process) when the process is killed
- [ ] `bun run typecheck` passes in `apps/server`
- [ ] Effect layer composition follows `ServiceMap.Service` / `Layer.effect` / `NodeRuntime.runMain` pattern from t3code

---

## Phase 4: File watcher + graph pipeline

**User stories**: #1 (point at repo), #3 (tsconfig auto-detection), #6 (exclude patterns)

### What to build

Add the file-watching and analysis pipeline as Effect layers. No WebSocket broadcast yet — the pipeline runs and logs output to confirm correctness.

**`WatcherService`** — wraps `chokidar.watch(targetDir)` in a `Layer.scoped`. Publishes `FileChangeEvent` (path + event type: added/modified/deleted) to an `Effect.PubSub`. The debounce (500ms) is applied here: collect events into a `Ref<FileChangeEvent[]>`, flush on a `Schedule` or `Fiber` after the window. Also watches `.git/COMMIT_EDITMSG` for commit detection.

**`AnalyzerService`** — consumes the `WatcherService` PubSub. On each debounced batch: calls `analyze(targetDir, config, previousGraph)` from `packages/analyzer`. Stores `currentGraph` in a `Ref`. On git commit write: emits a `session.reset` signal.

**`GraphService`** — holds the authoritative `Ref<DirectedGraph>` and a `PubSub<GraphDiff>` that downstream services (WsService, SessionService) subscribe to.

**.sentinelrc handling** in `ConfigService`: read exclude patterns and directoryColors. If file does not exist, generate directoryColors (FNV-1a hash → hue) for all top-level directories found in the graph, write the file. If file exists, only append `directoryColors` entries for new directories.

### Acceptance criteria

- [ ] Saving a TypeScript file in the watched repo triggers a console log of the resulting `GraphDiff` within 600ms
- [ ] Multiple saves within 500ms produce a single analysis cycle (one log entry)
- [ ] Writing `.git/COMMIT_EDITMSG` in the watched repo logs a `session.reset` signal
- [ ] `.sentinelrc` is created with correct structure on first run against a repo without one
- [ ] On subsequent runs, existing `.sentinelrc` entries are not overwritten
- [ ] New directories discovered after first index get their color appended to `.sentinelrc`
- [ ] `bun run typecheck` passes

---

## Phase 5: WebSocket server + snapshot delivery

**User stories**: #9 (full dependency graph), TanStack Query reconnection

### What to build

Add `WsService` as an Effect layer and deliver the initial `graph.snapshot` to a connecting browser client. This is the first end-to-end path: server → WebSocket → browser renders a graph.

**`WsService`** — wraps `ws.WebSocketServer` in `Layer.scoped`. On each new client connection: sends `graph.snapshot` (full serialized graph + empty session history + active circular deps). Subscribes to `GraphService`'s `PubSub<GraphDiff>` and broadcasts `graph.diff` + `session.changeEvent` + `session.summary` to all connected clients on each diff. Validates all outbound messages against `packages/contracts` Zod schemas before sending; logs and drops invalid messages.

**Client-side (`apps/web`):**
- Zustand store: `GraphStore` with `graphInstance: Graphology | null`, `blastRadius`, `pinnedNodes`, `sessionEvents`, `sessionSummary`, `focusMode`, `circularDeps`
- TanStack Query hook: `useGraphSnapshot()` — connects to WebSocket, receives `graph.snapshot`, hydrates the Graphology instance in the store, handles reconnection with exponential backoff
- Route `/` renders a placeholder `<GraphCanvas>` component (Sigma mount, no layout yet) that logs "graph loaded: N nodes, M edges"
- TanStack Router file-based routing set up for `/`, `/settings`, `/diff`

### Acceptance criteria

- [ ] Browser connecting to the server receives a valid `graph.snapshot` message
- [ ] `graph.snapshot` is validated against the Zod schema before send; an intentionally broken message is dropped and logged
- [ ] The Zustand store is populated with the Graphology instance after receiving the snapshot
- [ ] The browser console logs "graph loaded: N nodes, M edges" on connect
- [ ] Reconnection after server restart triggers a new snapshot delivery
- [ ] Invalid outbound WS messages are never delivered to the client
- [ ] Client→server `node.togglePin` is received, schema-validated, and logged by the server

---

## Phase 6: Live graph canvas

**User stories**: #9–#16 (full graph, colors, sizes, ForceAtlas2, zoom/pan, drag, layout persistence)

### What to build

Replace the placeholder `<GraphCanvas>` with a fully functional Sigma.js WebGL canvas in resting state. No blast radius yet — this phase is purely about the baseline graph experience.

**Sigma rendering:**
- Custom node renderer: use `eventColor` when non-null, otherwise `baseColor`. Node size scales with `inDegree` (min size 4px, max 12px, linear scale).
- Edge renderer: `intra-directory` edges at opacity 0.35, `cross-directory` edges at opacity 0.6, neutral color.
- `@react-sigma/core` lifecycle: `useSigma()` for instance access, `useRegisterEvents()` for node click/hover, `useLoadGraph()` for initial hydration.
- ForceAtlas2 Web Worker: `graphology-layout-forceatlas2/worker`. Start layout after graph loads. Pause after 3 seconds of stability or 10 seconds elapsed. On graph diff, run layout for 1 second for newly added nodes only (preserve existing positions).
- Noverlap anti-overlap: run after initial layout settles and after any diff that adds >5 nodes.

**Layout persistence:** serialize node `{ x, y }` positions to `localStorage` keyed by repo path after each layout pause. Restore on next load before Sigma renders.

**Interactions:** Sigma built-in zoom/pan. Node drag via `sigma-drag-node` or manual pointer events updating node `x/y`. `⌘F` search (Phase 9 for full command palette; this phase: basic input that calls `sigma.getGraph().findNode(...)` and centers the camera).

### Acceptance criteria

- [ ] Full graph renders in the browser with all nodes and edges
- [ ] Nodes are colored by their top-level directory using `baseColor`
- [ ] Cross-directory edges visibly brighter than intra-directory edges
- [ ] Node sizes vary with `inDegree` — hub files are visually larger
- [ ] ForceAtlas2 runs after load; tightly-coupled files cluster together
- [ ] Zoom and pan are fluid; node drag repositions nodes
- [ ] Layout positions survive a page reload (localStorage restore)
- [ ] `⌘F` centers camera on matching node

---

## Phase 7: Blast radius focus + animations

**User stories**: #19–#29 (blast radius, focusMode, animations, multi-file batching, Esc)

### What to build

Handle `graph.diff` messages in the client and apply the full blast radius visual system: event colors, visibility management, edge animation wave, `focusMode`, and `Esc` to clear.

**On receiving `graph.diff`:**
1. Apply structural changes to the Graphology instance (add/remove/modify nodes and edges)
2. Set `eventColor` on changed nodes (green/blue/red) and blast radius nodes (amber for downstream, muted teal `#5EAAA8` for upstream when `blastRadiusDirection: "both"`)
3. Apply `focusMode`:
   - `"hide"`: set `visible = false` on all non-blast-radius nodes; sigma reducers skip invisible nodes
   - `"dim"`: set `opacity = 0.15` on all non-blast-radius nodes
4. Animate the blast radius wave: stagger edge opacity transitions outward from changed nodes using `sigma-animation` (~300ms per hop, sequential through BFS layers)
5. Changed nodes pulse animation on appear (scale up 1.0 → 1.4 → 1.0, 400ms)
6. Deleted nodes: dashed border, fade-out animation, then remove from graph

**"Show full graph" button** (only in `hide` mode when blast radius active): HTML overlay div above Sigma canvas. On click: set all nodes `visible = true`, `opacity = 0.4` for 3 seconds, then restore blast radius state.

**`dim` mode hover:** `hoverVisible` attribute set to true on `mouseenter`, false on `mouseleave`. Sigma reducer reads this to override opacity to 1.0.

**Esc key handler:** first press → clear blast radius (restore all nodes to resting state). Second press → deselect node, close detail panel (Phase 9).

**Blast radius count badge:** rendered as a Sigma custom label or HTML overlay on the changed node showing "+N downstream".

**`focusMode` and `blastRadiusDirection`** read from Zustand store, populated from `graph.snapshot`'s config.

### Acceptance criteria

- [ ] Saving a file in the watched repo causes only blast radius nodes to be visible (in `hide` mode)
- [ ] Changed node pulses with event color at the moment of change
- [ ] Blast radius wave animates outward from changed node through downstream dependents sequentially
- [ ] Changed files show blue, downstream files show amber — visually distinct
- [ ] Blast radius count badge visible on changed node
- [ ] "Show full graph" button appears in `hide` mode; clicking reveals all nodes at 40% opacity for 3 seconds
- [ ] In `dim` mode, non-blast-radius nodes show at 15% opacity; hovering a dimmed node restores it fully
- [ ] Multiple files saved within 500ms produce a single blast radius showing the union
- [ ] `Esc` clears the blast radius and returns to resting state
- [ ] Deleted nodes fade out; added nodes animate in as green pulses

---

## Phase 8: Session management + timeline + SQLite

**User stories**: #41–#47 (timeline, session stats, git commit reset, ⌘⇧R, pinned nodes)

### What to build

Add `SessionService` to the server (Effect layer backed by `bun:sqlite`) and the timeline strip + session stats to the client.

**`SessionService` (Effect layer):**
- SQLite schema: `sessions(id, startedAt)`, `events(id, sessionId, filePaths, eventTypes, blastRadiusCounts, timestamp)`, `pinnedNodes(nodeId, sessionId)`
- On `graph.diff`: insert event row. Broadcast `session.summary` (cumulative counts for session: filesAdded, filesModified, filesDeleted, uniqueDownstreamNodes)
- On git commit write (from `WatcherService`): wait 500ms, broadcast `session.reset`, create new session row, clear events (keep pinned nodes)
- On `session.reset` client message (⌘⇧R): same as git commit reset but immediate, also clear pinned nodes
- On `node.togglePin` client message: upsert/delete `pinnedNodes` row, persist across resets
- `graph.snapshot` includes `sessionHistory` (all events from current session) so timeline survives page reload

**Client timeline strip:**
- Fixed-height strip at the bottom of the canvas
- Each entry: changed filenames, event type icons, blast radius count badge, elapsed time
- Framer Motion `AnimatePresence` + `motion.div` for entry slide-in animations
- Click on entry: re-activate that event's blast radius (set Zustand `activeBlastRadius` from stored event data)

**Session stats panel:** counters for files added/modified/deleted + total unique downstream nodes. Resets to 0 on session reset.

**⌘⇧R keyboard shortcut:** sends `session.reset` over WebSocket, then resets Zustand session state.

### Acceptance criteria

- [ ] Timeline strip shows an entry for every file change event
- [ ] Multi-file batch events appear as one timeline entry listing all files
- [ ] Clicking a timeline entry re-activates that blast radius on the graph
- [ ] Session stats show correct cumulative counts
- [ ] Git commit to the watched repo broadcasts `session.reset`; timeline clears after 500ms delay
- [ ] Session history survives a page reload (restored from `graph.snapshot.sessionHistory`)
- [ ] ⌘⇧R sends reset and clears timeline + stats + pinned nodes immediately
- [ ] Pinned nodes survive a git commit reset but not a ⌘⇧R reset
- [ ] `node.togglePin` persists pin state to SQLite; pinned nodes are included in `graph.snapshot`
- [ ] Server integration test: multiple saves within 500ms → single `graph.diff` broadcast

---

## Phase 9: Circular deps + node detail panel

**User stories**: #30–#36, #37–#40 (node hover tooltip, detail panel tabs, edge tooltip, P to pin, circular dep edges + toasts)

### What to build

Implement circular dependency visualization and the node detail panel.

**Circular dependency edges:**
- Edges in `newCircularDeps` rendered in orange (`#F97316`) with a custom Sigma edge renderer (dashed or distinct style)
- `activeCircularDeps` stored in Zustand, seeded from `graph.snapshot`; updated on `graph.diff`'s `newCircularDeps` / `resolvedCircularDeps`
- Orange edges survive `Esc`, blast radius transitions, and git commit resets — only clear when `resolvedCircularDeps` removes them
- Toast notification (Framer Motion, bottom-right) on each new circular dep introduced: "New circular dependency: A → B → C → A"
- Click circular dep edge: open detail panel showing full cycle list

**Node hover tooltip:**
- Sigma `enterNode` event → render HTML overlay tooltip: filename, directory, inDegree (importers count), current event state

**Node detail panel** (Framer Motion slide-in from right):
- **Dependencies tab**: full imports list (outbound edges) + full importers list (inbound edges)
- **Symbols tab**: exported functions/classes/types with reference counts (static: parse exports from file path using regex or dependency-cruiser output; symbol-level change tracking deferred to Phase 2)
- **History tab**: all session events where this file appeared, with timestamps and blast radius counts

**Edge hover tooltip:**
- Sigma `enterEdge` event → tooltip: source file, target file, import type (named/default/side-effect) from dependency-cruiser output

**`P` keyboard shortcut:** when a node is selected (click), press `P` to send `node.togglePin` over WebSocket; update Zustand `pinnedNodes`

**`Esc` second press** (Phase 7 implemented first press): deselect node, close detail panel.

### Acceptance criteria

- [ ] Hovering a node shows tooltip with filename, directory, importer count, event state
- [ ] Clicking a node opens the detail panel with Dependencies / Symbols / History tabs
- [ ] Dependencies tab lists correct imports and importers
- [ ] History tab shows all session events for this file
- [ ] Clicking a circular dep edge shows the full cycle in the detail panel
- [ ] New circular dep triggers a toast notification immediately
- [ ] Orange circular dep edges persist through blast radius transitions and git commit resets
- [ ] Resolved circular deps (in `resolvedCircularDeps`) remove the orange edge
- [ ] `P` on selected node toggles pin; pinned state reflects in graph (distinct visual indicator)
- [ ] Edge hover tooltip shows source, target, and import type

---

## Phase 10: Onboarding + settings + status indicator

**User stories**: #1–#8 (repo picker, indexing progress, auto-detect tsconfig, auto-open browser, recent repos, sentinelrc, status indicator)

### What to build

Build the onboarding flow (shown when no repo is configured) and the `/settings` page.

**Onboarding screen** (shown when `ConfigService` has no `targetDir`):
- Text input for repo path + native file picker button (Phase 2 for Electron native picker; Phase 1: `<input type="file" webkitdirectory>` or plain path input)
- Submit triggers server to start watcher on the specified path
- Live indexing progress: server streams discovered file count over WebSocket (`indexing.progress` event) during initial `buildGraph`; client shows file list populating in real time
- Recent projects: stored in `localStorage` as `[{ path, lastOpened }]`; shown as one-click shortcuts on the onboarding screen

**`/settings` page** (TanStack Router):
- Show/edit `.sentinelrc` settings: `exclude` patterns, `focusMode`, `blastRadiusDirection`, `directoryColors`
- Changes send `config.update` over WebSocket; server updates `ConfigService` ref and restarts watcher if path changes

**Status indicator:**
- Persistent badge in topbar: green dot = watching, amber = idle/reconnecting, red = error
- Driven by WebSocket connection state + WatcherService status events

**`browser.open`** call in `HttpService` on startup (already in Phase 3) — confirm it works correctly for the onboarding flow URL.

### Acceptance criteria

- [ ] First run shows onboarding screen with path input and empty recent projects list
- [ ] Entering a valid repo path starts indexing; indexing progress shows files being discovered
- [ ] Recent projects appear on subsequent visits; clicking one resumes watching
- [ ] Status indicator shows correct state: green when watcher is active, amber on disconnect
- [ ] `/settings` page shows current `.sentinelrc` values as editable fields
- [ ] Changing `focusMode` in settings immediately affects blast radius behavior
- [ ] `.sentinelrc` is never overwritten; new directories' colors are appended correctly
- [ ] Browser opens automatically at startup

---

## Phase 11: Keyboard shortcuts + command palette

**User stories**: #54–#60 (⌘K, Tab cycling, ←/→ timeline, ⌘F, Space to fit, P, Esc)

### What to build

Implement the command palette and all keyboard shortcuts using a global key listener.

**Command palette (`⌘K`):**
- Modal overlay (Framer Motion scale-in), fuzzy search input
- Commands: navigate to node (jumps camera), go to settings, go to diff mode, reset session, toggle focusMode, toggle blastRadiusDirection, all keyboard shortcuts listed

**Global keyboard shortcuts:**
- `Tab`: cycle through changed nodes in current blast radius (or session if no active blast radius); camera centers on each
- `←` / `→`: step backward/forward through timeline events; re-activates that event's blast radius
- `⌘F`: focus graph search input, center camera on match
- `Space`: `sigma.camera.animatedReset()` to fit entire graph to screen
- `P`: toggle pin on selected node (already in Phase 9; ensure it works from keyboard without mouse)
- `Esc`: two-stage (Phase 7 first press already implemented; Phase 9 second press already implemented)
- `⌘⇧R`: session reset (Phase 8)

**Directory filter (left rail):**
- List of top-level directories with their `directoryColor` swatches
- Clicking a directory hides all nodes not in that directory (independent of blast radius); clicking again restores full graph
- Managed as `directoryFilter: string | null` in Zustand

### Acceptance criteria

- [ ] `⌘K` opens command palette; typing filters commands; `Enter` executes; `Esc` closes
- [ ] All shortcut commands discoverable in the command palette with their key label
- [ ] `Tab` cycles through changed nodes with camera centering
- [ ] `←` / `→` navigates timeline events and re-activates blast radius
- [ ] `Space` fits the full graph to screen
- [ ] Directory filter in left rail hides/shows nodes by top-level directory
- [ ] Directory filter coexists with blast radius (blast radius takes precedence; directory filter re-applies when blast radius clears)

---

## Phase 12: Git diff mode

**User stories**: #48–#53 (Live/Diff toggle, commit log, base/head selection, diff graph rendering, summary line)

### What to build

Implement the `/diff` route as a separate display context.

**Live/Diff toggle** in topbar: navigates between `/` and `/diff` routes.

**Server additions:**
- `GET /api/git/log` — returns structured commit log: `{ hash, shortHash, message, author, date, branches }[]`. Uses `simple-git` or `execa` calling `git log`.
- `GET /api/git/diff?base=<hash>&head=<hash>` — returns `GraphDiff` representing the file changes between two commits: runs `git diff --name-status base head`, maps to `{ addedNodes, removedNodes, modifiedNodes }`, runs analyzer on those files, returns result.

**`/diff` route:**
- Commit log panel (left side): scrollable list showing git graph spine (ASCII-style), short hash, message, branch label, author, date
- Click to set base commit, `Shift+click` to set head commit
- Summary line: "N added · M modified · K removed · X commits apart"
- Graph canvas: same Sigma component as live mode; renders only changed nodes (same event colors); unchanged nodes hidden
- Session timeline, session stats, ⌘⇧R hidden in diff mode (Zustand `isDiffMode` flag gates these elements)

### Acceptance criteria

- [ ] Live/Diff toggle switches between routes without losing graph layout
- [ ] Commit log shows correct entries from `git log`
- [ ] Clicking a commit highlights it as base; Shift+click sets head
- [ ] Graph in diff mode shows only files changed between base and head, with correct event colors
- [ ] Summary line shows correct counts
- [ ] Session timeline, session stats, and ⌘⇧R are not visible in diff mode
- [ ] Switching back to Live mode restores the live session state

---

## Phase 13: Electron desktop scaffold (Phase 2 foundation)

**User stories**: PRD Phase 2 — Electron desktop app, self-contained, no terminal required

### What to build

Scaffold `apps/desktop` as an Electron app using the native CLI so the monorepo is desktop-ready. No business logic in this phase — purely the skeleton that wraps `apps/web` and manages `apps/server` as a child process.

**Scaffold using native CLI:**
```bash
# From monorepo root
bun create electron-vite apps/desktop
# or: bunx create-electron-app apps/desktop --template=vite-ts
```

**`apps/desktop` responsibilities:**
- Electron `main` process: spawn `apps/server` as a child process (via `child_process.spawn`), forward its stdout/stderr to the renderer's DevTools console
- `BrowserWindow` loads `http://localhost:<port>` (same web app, no code changes to `apps/web` required)
- Preload IPC bridge: `ipcRenderer.invoke('pick-directory')` → native `dialog.showOpenDialog` (replaces the Phase 10 `<input webkitdirectory>` with a native picker)
- System tray icon with status: watching / idle / error (mirrors the web status indicator)
- `electron-updater` wired for GitHub Releases auto-updates
- `package.json` scripts: `dev` (electron-vite dev), `build` (electron-vite build + package), `typecheck`

**Turbo pipeline additions:**
- `apps/desktop#dev` depends on `@sentinel/web#build` and `@sentinel/server#build`
- `apps/desktop#build` depends on `^build`

**No changes needed to `apps/web` or `apps/server`** — the Electron shell is purely additive.

### Acceptance criteria

- [ ] `apps/desktop` scaffolded via native CLI (not manually written)
- [ ] `bun run dev` in `apps/desktop` opens an Electron window loading the web app
- [ ] Server child process starts automatically when Electron launches
- [ ] Native directory picker works via IPC (replaces `<input webkitdirectory>`)
- [ ] System tray icon reflects watcher status
- [ ] `bun run build` in `apps/desktop` produces a distributable
- [ ] `bun run typecheck` passes

---

## Verification (end-to-end)

After all phases:

```bash
# In /Users/linhanyu/Workspace/Projects/sentinel
bun run build          # All packages build cleanly
bun run typecheck      # Zero TypeScript errors
bun run test           # All tests pass
bun run lint           # Zero oxlint errors
bun run fmt:check      # Zero formatting issues

# Start dev server (point at a real TypeScript repo)
bun run dev:server -- --target /path/to/some/typescript/project
bun run dev:web

# Manual verification
# 1. Browser opens at localhost:5173 → onboarding screen
# 2. Enter a TypeScript repo path → indexing progress → full graph renders
# 3. Edit a file in the watched repo → blast radius focuses within 600ms
# 4. Check timeline entry added with correct file and blast radius count
# 5. Press Esc → graph returns to resting state
# 6. Make a git commit in the watched repo → session resets after 500ms
# 7. ⌘K → command palette opens with all shortcuts listed
# 8. Switch to /diff → select two commits → diff graph renders
```
