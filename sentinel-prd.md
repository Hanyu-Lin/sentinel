# Sentinel — Product Requirements Document

> **Status:** Phase 1 MVP — finalised  
> **Last updated:** March 2026  
> **Purpose:** Project roadmap, design reference, and implementation guide

---

## Problem Statement

AI coding agents — Claude Code, Cursor, Copilot, Codex — are becoming a primary driver of code changes in modern development workflows. These agents edit files autonomously, often across many modules simultaneously, with no mechanism for the developer to understand the structural consequences of those edits in real time.

Existing review tools (CodeRabbit, Greptile, GitHub code review) are post-hoc and PR-gated. They only run once changes are already committed. By that point, an AI agent may have introduced cascading dependency breakages across dozens of files that are expensive to untangle.

Solo developers working locally with AI agents have no live visibility into:

- Which files have changed and what depends on them
- How large the blast radius of a given edit actually is
- Whether a change has created new circular dependencies or broken structural contracts between modules
- How the agent's edits are propagating through the codebase as they happen

The result is that developers either pause frequently to mentally trace dependency chains themselves — negating much of the agent's productivity gain — or they let the agent run freely and discover structural breakages only when the build fails or tests break.

---

## Solution

**Sentinel** is an always-on live dependency graph for AI agent sessions. It runs alongside the developer's editor as a local server with a web UI, watches a target repository for file changes, and maintains a live animated graph of the codebase's dependency structure.

When an AI agent modifies files, Sentinel detects the changes within seconds, re-analyzes the affected portions of the dependency graph, computes the union of all downstream blast radii, and focuses the graph canvas on that impact in real time.

The developer sees their codebase as a living map — the full graph is always present, and when the agent acts, the blast radius is isolated with everything else stepping back. No mode switches. No UI shifts. The graph just tells you what matters right now.

Sentinel is not a replacement for the AI agent. It is the developer's spatial awareness while the agent works.

### Incremental rollout

**Phase 1 — MVP (this document)**
Live dependency graph with blast radius focus. Pure structural visibility. No AI review. Local dev only. Web UI accessed via browser.

**Phase 2**
AI reviewer (bug/logic detection, security, cross-file coherence) using Anthropic SDK with streamed findings. Electron desktop app (self-contained, no terminal required). Claude Code agent hook integration (PreToolUse/PostToolUse for pre-warming analysis).

---

## Graph Design

### The full-graph approach

Sentinel always shows the complete dependency graph in Live mode. There is no zoom-to-neighbourhood mode, no semantic zoom, no folder-as-node hierarchy. The full graph is the canvas. This preserves the developer's spatial mental model of the codebase and means nothing ever unexpectedly reorganises.

Relevance is communicated through **visibility**, not layout. When the agent acts, the blast radius is made prominent and everything else recedes. When nothing is active, all nodes are visible at equal weight. The graph layout never changes in response to a change event — only node visibility and color do.

Git diff mode is a separate display context with its own rules. The full-graph principle applies to Live mode only.

### Resting state

When no blast radius is active — before the first change, after a session reset, or after pressing `Esc` — the graph shows all nodes at full visibility in their directory base colors. This is the developer's orientation view: the full codebase structure, readable by directory through color, with hub files visually larger. This is a calm, neutral state. No highlights, no alerts.

### Active state — blast radius focus

When one or more files change within the debounce window, Sentinel computes the **union of all blast radii** and transitions the graph simultaneously. Multiple files changed by the agent in rapid succession are treated as a single change event.

Blast radius nodes (the changed files plus all downstream dependents, transitively) are shown at full visibility with event colors applied. All other nodes recede according to the active `focusMode` setting:

- **`focusMode: hide` (default)** — non-blast-radius nodes are removed from the canvas entirely. The blast radius subgraph is typically 8–20 nodes, readable as a clean dependency diagram. This is the most focused experience.
- **`focusMode: dim`** — non-blast-radius nodes remain on the canvas at 15% opacity, preserving spatial context of the full graph while keeping the blast radius clearly dominant. Hovering over any dimmed node temporarily restores it to full visibility and shows its label. The node returns to 15% opacity when the mouse leaves.

In `hide` mode there are no ghost nodes to hover. Instead, a persistent **"Show full graph"** button appears in the top-right of the canvas whenever a blast radius is active. Clicking it temporarily reveals all nodes in their base colors at 40% opacity for 3 seconds, then returns to the focused view. This gives the developer a spatial orientation snapshot without a mode switch.

Pressing `Esc` with a blast radius active clears it entirely, returning all nodes to resting-state visibility without resetting the session. Pressing `Esc` again with no blast radius active deselects the current node and closes the detail panel.

### Multi-file change events

When the agent saves multiple files within the 500ms debounce window, Sentinel treats them as a single change event:

- The blast radius is the **union** of all individual blast radii
- The timeline records one entry listing all changed files (e.g. "3 files changed · +14 downstream")
- Each changed file node shows its individual event color (green / blue / red)
- The blast radius count badge shows the total unique downstream nodes across all changes
- The session stats increment by the total counts for the batch

### Blast radius definition

The blast radius is **strictly downstream** by default — only files that transitively import the changed file are included. Files that the changed file imports are not highlighted.

This is a precise, trustworthy signal. Every highlighted node is one that could genuinely be affected by the change. The developer learns to trust that highlighted = at risk.

**Blast radius direction is configurable** (`blastRadiusDirection: downstream | both`). When set to `both`, upstream nodes (files the changed file imports) are shown alongside downstream nodes but in a visually distinct style — a muted highlight color rather than the full amber event color — so the developer can always tell which direction the risk flows.

### Node color system

Node colors carry two layers of meaning simultaneously. They never conflict — event color takes priority over base color when active, base color shows at all other times.

**Base color — directory ownership (permanent)**

Every node has a base color derived from its top-level directory. Colors are generated automatically at index time using a deterministic hashing algorithm and are stable across restarts.

**Generation algorithm:**

Colors are derived by hashing the directory path string (FNV-1a 32-bit) into a hue value (0–360). Saturation is fixed at 65% and lightness at 58%, tuned for dark-mode readability. A reserved hue avoidance step ensures generated colors never land within 30 hue degrees of any event color. This guarantees every project gets its own consistent palette without manual configuration.

```
function directoryColor(dirPath: string): string {
  const hash = fnv1a32(dirPath)
  const hue = hash % 360
  const reserved = [120, 220, 0, 40, 25]  // green, blue, red, amber, orange
  const adjusted = avoidReservedHues(hue, reserved, minDistance: 30)
  return hsl(adjusted, saturation: 65%, lightness: 58%)
}
```

Generated colors are written to `.sentinelrc` on first index. Sentinel only writes to `.sentinelrc` if the file does not already exist, or appends new `directoryColors` entries for directories not yet present — it never overwrites existing configuration. This prevents Sentinel from creating unexpected `git status` noise. The developer can override any directory color by editing `.sentinelrc` directly; manual entries always take precedence over the algorithm.

**Event color — change state (temporary)**

Event colors override the base color for the duration of the active blast radius. They clear on session reset (`⌘⇧R`) or git commit. Pinned nodes retain their event color until explicitly unpinned.

| Event               | Color      | Hex       | Visual treatment                                                                            |
| ------------------- | ---------- | --------- | ------------------------------------------------------------------------------------------- |
| Added               | Green      | `#22C55E` | Solid fill, pulse animation on appear                                                       |
| Modified            | Blue       | `#3B82F6` | Solid fill, pulse animation on change                                                       |
| Deleted             | Red        | `#EF4444` | Dashed border, fade-out animation on removal                                                |
| Impacted downstream | Amber      | `#F59E0B` | Solid fill, no animation                                                                    |
| Impacted upstream   | Muted teal | `#5EAAA8` | Solid fill, lower saturation than downstream — only shown when `blastRadiusDirection: both` |
| Circular dependency | Orange     | `#F97316` | Solid fill, persistent until resolved                                                       |

**Node size** scales with **in-degree** — the number of files that directly import it. Files imported by many others render larger, making high-risk nodes visually prominent without inspection.

### Edge rendering

Edges have two visual tiers in the resting state:

- **Intra-directory imports** — dim, `0.35` opacity, neutral color
- **Cross-directory imports** — brighter, `0.6` opacity, neutral color

During an active blast radius, edges along the blast path render at full opacity in the blast color (blue for downstream impact paths, teal for upstream paths, orange for circular cycles). Non-blast edges recede with their connected nodes according to `focusMode`.

### Layout

ForceAtlas2 is the single layout algorithm. It groups tightly coupled files spatially through physics — files that import each other naturally cluster together. Directory base colors reinforce this structure visually without needing boundary shapes.

ForceAtlas2 runs in a Web Worker to avoid blocking the UI thread. Layout is incremental — a graph diff only positions newly added nodes; existing node positions are preserved. An anti-overlap pass (Noverlap) runs after initial index and after diffs that add more than five nodes.

There is no radial mode, no hierarchical mode, and no cluster boundary rendering in Phase 1.

### Circular dependency persistence

Circular dependency edges (orange) are persistent — they survive blast radius transitions, session resets, and `Esc`. They only clear when the circular dependency is resolved in the code and a new graph diff confirms the cycle is gone. The `GraphDiff` type includes both `newCircularDeps` and `resolvedCircularDeps` so clients can add and remove orange edges correctly.

### Session reset behaviour

Two triggers reset the session. Reset clears: blast radius highlights, timeline events, session stats, and unpins all non-pinned nodes. It does not clear circular dependency edges (they are structural, not session state).

1. **Git commit** — Sentinel watches `.git/COMMIT_EDITMSG`. On write, a `session.reset` event is broadcast to all connected clients. The graph returns to resting state with a brief settle animation (500ms) so the developer gets a final glimpse of what the commit contained.
2. **Manual reset** — `⌘⇧R`. Immediate. No confirmation.

**Pinned nodes** survive a git commit reset. Their event color and blast radius highlight persist until the developer manually unpins them with `P` or triggers a manual `⌘⇧R` reset. This gives the developer explicit control over what carries across commit boundaries.

**Session stats** reflect only the current session. When a commit resets the session, stats return to zero. Pinned nodes' stats are not preserved — only their visual highlight state is.

---

## User Stories

### Setup & Onboarding

1. As a solo developer, I want to open Sentinel and point it at a repository by typing a path or using a native file browser, so that setup takes under a minute with no configuration required.
2. As a developer, I want Sentinel to index the repository immediately after I select a path, showing a live progress screen listing files as they are discovered and parsed, so that I see the codebase structure taking shape rather than staring at a blank screen.
3. As a developer, I want Sentinel to auto-detect my TypeScript config and path aliases from `tsconfig.json`, so that the dependency graph resolves correctly without any manual configuration.
4. As a developer, I want Sentinel to open the graph UI in my browser automatically when the server starts, so that I never have to navigate to a localhost URL manually.
5. As a developer, I want recently opened repositories to appear on the start screen as one-click shortcuts, so that returning to a project takes one click.
6. As a developer, I want to configure which directories and file patterns Sentinel ignores in `.sentinelrc`, so that generated files, test fixtures, and node_modules never appear in the graph.
7. As a developer, I want `.sentinelrc` committed to the repo, so that settings are version-controlled and any machine running Sentinel against the same repo gets identical behaviour. I want Sentinel to never overwrite existing `.sentinelrc` content — only append new entries for directories not yet configured.
8. As a developer, I want Sentinel to show a persistent status indicator (watching / idle / error) in the UI, so that I always know whether the file watcher is active.

### Live Dependency Graph — Resting State

9. As a developer, I want to see my repository's full dependency graph as an interactive WebGL canvas showing all files as nodes and all import relationships as directed edges, so that I have a complete structural map of my codebase at all times.
10. As a developer, I want nodes colored by their top-level directory using auto-generated colors, so that I can read the codebase's architectural boundaries at a glance without any configuration.
11. As a developer, I want cross-directory edges to render slightly brighter than intra-directory imports, so that coupling across architectural boundaries is visually apparent without any additional UI elements.
12. As a developer, I want node sizes to scale with the number of files that directly import them, so that high-impact hub files are visually prominent without me needing to inspect them individually.
13. As a developer, I want the graph laid out with ForceAtlas2 so that tightly coupled files cluster spatially, making the codebase's architecture legible through proximity and color together.
14. As a developer, I want to zoom and pan the graph fluidly, so that I can move between a high-level overview and a focused view of any area at any time.
15. As a developer, I want to drag individual nodes to reposition them, so that I can manually arrange areas of the graph that matter for my current task.
16. As a developer, I want my layout positions and zoom level to persist between sessions, so that I don't have to re-navigate every time I restart Sentinel.
17. As a developer, I want to search the graph by filename with `⌘F`, so that I can jump directly to any node without panning.
18. As a developer, I want to click a directory in the left rail to focus the graph on that directory — hiding all other nodes — independently of any active blast radius, so that I can manually explore one area of the codebase at any time.

### Blast Radius — Active State

19. As a developer, I want the graph to immediately focus on the blast radius when a file change is detected, receding all non-affected nodes according to my `focusMode` setting (hidden by default), so that my attention goes directly to what was affected without any manual action.
20. As a developer, I want the changed file to pulse with its event color (green for added, blue for modified) at the moment the change is detected, so that I can see the exact origin of the change instantly.
21. As a developer, I want edges to animate outward from the changed node through its downstream dependents in sequence, so that I can watch the blast radius propagate as a visual wave rather than all nodes appearing simultaneously.
22. As a developer, I want directly changed files and transitively impacted downstream files to use distinct colors (blue vs amber), so that I can distinguish first-order changes from downstream effects at a glance.
23. As a developer, I want a blast radius count shown on the changed node (e.g. "+8 downstream"), so that I have an immediate quantitative measure of the impact.
24. As a developer, I want a "Show full graph" button to appear in the canvas when `focusMode` is `hide`, so that I can see a spatial overview of the full graph for 3 seconds without switching modes or losing the blast radius context.
25. As a developer, I want the `focusMode` (hide or dim) to be configurable in `.sentinelrc`, so that I can choose the level of context I prefer during blast radius focus. In `dim` mode I want to hover over any dimmed node to temporarily restore it to full visibility.
26. As a developer, I want the blast radius direction (downstream only vs both directions) to be configurable in `.sentinelrc`, defaulting to downstream, so that I can opt in to also seeing upstream context when useful.
27. As a developer, I want newly created files to animate into the graph as new green nodes, so that I can see when the agent is adding modules to the codebase.
28. As a developer, I want deleted files to animate out of the graph with their edges dissolving, so that I can see when the agent removes modules and identify any newly dangling dependencies.
29. As a developer, I want multiple files changed within the same debounce window to be treated as a single change event, showing a union of their blast radii, so that rapid agent edits produce one coherent focused view rather than overlapping flash states.

### Node & Edge Detail

30. As a developer, I want to hover over any visible node to see a tooltip showing its filename, directory, number of direct importers, and current event state, so that I can get context without opening the detail panel.
31. As a developer, I want to click any node to open a detail panel with three tabs — Dependencies, Symbols, and History — so that I can investigate any file at the depth I need without leaving the UI.
32. As a developer, I want the Dependencies tab to show the file's full import list and the complete list of files that import it, so that I understand its full structural position in the dependency graph.
33. As a developer, I want the Symbols tab to show the functions, classes, and types exported by the file and how many other files reference each one, so that I can understand the file's public API and its usage across the codebase. Symbol-level change tracking (which symbols changed in the current session) is a Phase 2 capability requiring AST analysis.
34. As a developer, I want the History tab to show all changes made to this file in the current session with timestamps and blast radius counts, so that I have a per-file audit trail of the agent's work.
35. As a developer, I want to hover over any edge to see a tooltip identifying the source file, target file, and import type (named / default / side-effect), so that I understand the precise nature of a dependency relationship.
36. As a developer, I want to press `P` on a selected node to toggle its pin state, so that I can keep its blast radius highlight across git commit resets while I investigate related changes.

### Circular Dependency Detection

37. As a developer, I want circular dependencies shown as persistent orange edges that remain visible in both resting and active states, so that structural problems introduced by the agent are always visible regardless of what else is happening.
38. As a developer, I want a toast notification when a new circular dependency is introduced, so that I am alerted immediately even if I am not looking at the relevant area of the graph.
39. As a developer, I want to click a circular dependency edge to see the full cycle listed (A → B → C → A) in the detail panel, so that I can understand exactly which files are involved without leaving the UI.
40. As a developer, I want circular dependency edges to automatically clear when the cycle is resolved in the code and a new graph analysis confirms the dependency is gone, so that the graph stays accurate without requiring manual dismissal.

### Session Management & Timeline

41. As a developer, I want a timeline strip showing all change events this session in chronological order, so that I can review the complete sequence of the agent's edits.
42. As a developer, I want each timeline event to show the filename(s) changed, event type(s) (added / modified / deleted), total blast radius count, and elapsed time, so that I can scan the full session history at a glance including multi-file batch events.
43. As a developer, I want to click any timeline event to re-activate that change's blast radius on the graph, so that I can revisit any past edit without restarting the session.
44. As a developer, I want a session stats panel showing total files added, modified, deleted, and total unique downstream nodes impacted this session, so that I can see the cumulative scope of the agent's work.
45. As a developer, I want to reset the session with `⌘⇧R`, clearing all blast radius highlights, timeline events, session stats, and unpinning all nodes including pinned ones, so that I start a fully clean slate for a new agent task.
46. As a developer, I want the session to reset automatically when Sentinel detects a git commit, returning the graph to resting state, so that each commit represents a natural session boundary.
47. As a developer, I want pinned nodes to survive a git commit reset and only fully clear on a manual `⌘⇧R`, so that I remain in control of what context carries across commit boundaries.

### Git Diff Mode

48. As a developer, I want to switch between Live mode and Git diff mode from a toggle in the topbar, so that I can compare any two commits on the same graph canvas without opening a terminal.
49. As a developer, I want to pick two commits from a visual commit log showing the git graph spine, commit hash, message, branch label, author, and date, so that I have enough context to identify the right checkpoints at a glance.
50. As a developer, I want to click a commit in the log to set it as the base, and Shift+click to set it as the head, so that selecting a range is fast and requires no dropdowns or confirmation dialogs.
51. As a developer, I want the graph in diff mode to show only the files that changed between the two commits, hiding unchanged nodes, using the same event colors as live mode (green = added, blue = modified, red = removed), so that I read a commit diff exactly the same way I read a live change.
52. As a developer, I want a summary line under the commit selectors showing counts of added, modified, and removed files and how many commits apart the selections are, so that I can orient myself before reading the graph.
53. As a developer, I want the session timeline, session stats, and reset controls to be hidden in diff mode, since those are live-session concepts that do not apply to a static commit comparison.

### Keyboard & Command Palette

54. As a developer, I want a command palette accessible with `⌘K` that gives me access to all navigation, actions, and keyboard shortcut discovery in one place, so that I can drive the entire UI from the keyboard without memorising shortcuts.
55. As a developer, I want to cycle through all changed nodes in the current session using `Tab`, so that I can review each change sequentially without touching the mouse.
56. As a developer, I want to navigate timeline events with `←` and `→` arrow keys, so that I can step through session history from the keyboard.
57. As a developer, I want to search the graph by filename with `⌘F`, so that I can jump directly to any node without panning.
58. As a developer, I want to press `P` on a selected node to toggle its pin state, so that I can pin or unpin without using the mouse.
59. As a developer, I want to press `Space` to fit the entire graph to the screen, so that I can reset my view instantly after zooming or panning.
60. As a developer, I want `Esc` to have two stages: first press clears the active blast radius (returning to resting state); second press deselects the current node and closes the detail panel, so that dismissing UI state is always one or two keypresses away and never requires the mouse.

---

## Implementation Decisions

### Monorepo architecture

Turborepo monorepo managed with Bun. Strict layer separation — each package has a single responsibility and a stable public interface. No package imports from an app. Apps import from packages only.

```
apps/
  web/        React 19 + Vite — all UI: graph canvas, panels, timeline, onboarding
  server/     Node.js — WebSocket server, file watcher, analysis orchestrator

packages/
  contracts/  Zod schemas for all WebSocket messages. Schema-only — zero runtime logic.
  analyzer/   dependency-cruiser + Graphology — graph building, diffing, blast radius
  shared/     Utilities: debounce, color generation, graph serialization, session helpers
  reviewer/   Scaffolded empty in Phase 1. Implemented in Phase 2.
```

### Tooling

| Concern                   | Tool                         |
| ------------------------- | ---------------------------- |
| Package manager + runtime | Bun                          |
| Monorepo orchestration    | Turborepo                    |
| Language                  | TypeScript 5.7 (strict mode) |
| Linting                   | oxlint                       |
| Testing                   | Vitest                       |
| Schema validation         | Zod                          |

### Server (`apps/server`)

- **chokidar** watches the target repository with a 500ms debounce. Multiple file saves within the window are batched into a single analysis cycle.
- On each debounced trigger: run dependency-cruiser on all changed files → diff the Graphology graph → compute the union blast radius via BFS traversal → broadcast all results over WebSocket as a single `graph.diff` event.
- **Bun SQLite** (`bun:sqlite`) persists session change history so the timeline survives page reloads without a separate database process.
- **Git commit detection**: chokidar watches `.git/COMMIT_EDITMSG`. On write, broadcast `session.reset` to all connected clients after a 500ms delay (to allow any in-flight file change events to complete first).
- **Agent hook endpoint**: an HTTP endpoint for Claude Code PreToolUse/PostToolUse payloads is present in Phase 1 but returns 204 and no-ops. Activated in Phase 2.
- All outbound WebSocket messages are validated against `packages/contracts` Zod schemas before broadcast. Invalid messages are logged and dropped, never sent.

### Analyzer (`packages/analyzer`)

- **dependency-cruiser** produces the raw dependency graph as structured JSON. Configured to respect tsconfig path aliases and `.sentinelrc` exclude patterns.
- **Graphology** is the canonical in-memory graph. The analyzer maintains `previousGraph` and `currentGraph` snapshots. Each analysis cycle produces a typed `GraphDiff`:

```ts
type GraphDiff = {
  addedNodes: GraphNode[];
  removedNodes: string[]; // node IDs
  modifiedNodes: GraphNode[];
  addedEdges: GraphEdge[];
  removedEdges: string[]; // edge IDs
  newCircularDeps: CircularDep[];
  resolvedCircularDeps: string[]; // cycle IDs no longer present
  blastRadius: {
    downstream: string[]; // node IDs impacted downstream
    upstream: string[]; // node IDs impacted upstream — empty when blastRadiusDirection is "downstream"
    changedNodeIds: string[]; // the directly changed files
  };
};
```

- **Blast radius** is computed using **BFS traversal** (`graphology-traversal`) following directed edges from each changed node. `graphology-shortest-path` is not used here — blast radius requires finding all reachable nodes, not the shortest path between two specific nodes.
- When `blastRadiusDirection: "both"`, a second BFS traversal runs in the reverse direction to find upstream nodes. Upstream results are stored separately in `blastRadius.upstream` so the client can apply distinct styling.
- **In-degree** (direct import count) is computed per node and stored as a node attribute. Used for visual node size scaling. Recomputed on full graph rebuild and whenever a node's in-degree changes in a diff.
- **Circular dependency detection** runs as a strongly-connected-components pass on each diff. New cycles are included in `newCircularDeps`; resolved cycles in `resolvedCircularDeps`.
- All output types are defined in `packages/contracts`.

### WebSocket protocol

All messages are Zod-typed. The server validates outbound messages before sending. The client validates inbound messages before applying.

**Server → client**

| Message               | Payload                                                                                 | When                                                                                             |
| --------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `graph.snapshot`      | Full serialized graph, all node attributes, session history, active circular deps       | Initial connection, reconnection                                                                 |
| `graph.diff`          | Full `GraphDiff` including blast radius node ID lists (downstream + upstream + changed) | Each debounced change event (one event per debounce batch, regardless of how many files changed) |
| `session.changeEvent` | Changed file paths, event types, blast radius counts (downstream + upstream), timestamp | Same trigger as `graph.diff` — sent together                                                     |
| `session.summary`     | Cumulative session stats                                                                | After each change event                                                                          |
| `session.reset`       | —                                                                                       | Git commit detected, or manual reset                                                             |

**Client → server**

| Message          | Payload               | When                         |
| ---------------- | --------------------- | ---------------------------- |
| `config.update`  | Partial config fields | Runtime settings change      |
| `session.reset`  | —                     | `⌘⇧R` pressed                |
| `node.togglePin` | `{ nodeId: string }`  | `P` pressed on selected node |

Note: hover state is managed entirely client-side. No hover messages are sent to the server — the server does not hold or need visibility state.

### Graph UI (`apps/web`)

- **Sigma.js** is the WebGL renderer. **@react-sigma/core** provides React lifecycle bindings (mount, unmount, sigma instance access, event handlers).
- **Graphology** is the client-side data model. The client applies `graph.diff` payloads only — it never independently recomputes the graph.
- **graphology-layout-forceatlas2** runs in a **Web Worker**. Only newly added nodes are positioned on each diff; existing node positions are preserved. An anti-overlap pass (Noverlap) runs after initial index and after diffs adding more than five nodes.
- Each node stores two color attributes: `baseColor` (directory, permanent) and `eventColor` (change state, null when inactive). Sigma's custom node renderer uses `eventColor` when set, `baseColor` otherwise.
- **Visibility management**: each node has a `visible` boolean attribute. When a blast radius activates, the renderer sets `visible = false` on all non-blast-radius nodes (in `hide` mode) or `opacity = 0.15` (in `dim` mode). Sigma's reducer skips invisible nodes entirely — they consume no render budget. In `dim` mode, a `hoverVisible` attribute temporarily overrides opacity to 1.0 for a single node on hover.
- **"Show full graph" button**: rendered as an HTML overlay element above the Sigma canvas. Visible only in `hide` mode when a blast radius is active. On click, temporarily sets all node `visible = true` and `opacity = 0.4` for 3 seconds, then restores the blast radius focus state.
- **sigma-animation** interpolates color and size transitions over ~300ms so state changes feel live rather than jarring.
- **zustand** manages all client state: Graphology instance, active blast radius node IDs (downstream + upstream + changed), pinned node IDs, hover node ID, directory filter, diff mode state, session summary, timeline events, `focusMode` value.
- **framer-motion** handles all off-canvas animations: detail panel slide-in, toast notifications for new circular deps, timeline strip entry animations.
- **@tanstack/react-query** fetches the initial `graph.snapshot` on mount and handles reconnection with exponential backoff.
- **@tanstack/react-router** handles routing: `/` (graph), `/settings`, `/diff`.
- **Tailwind CSS v4 + shadcn/ui** for all non-canvas UI components.

### Settings exposed via `.sentinelrc`

Sentinel writes `.sentinelrc` only on first index (file does not exist) or to append new `directoryColors` entries. It never overwrites or removes existing entries.

```jsonc
{
  // Directories and glob patterns to exclude from the graph
  "exclude": ["**/node_modules", "**/dist", "**/*.test.ts", "**/*.spec.ts"],

  // How non-blast-radius nodes appear during an active blast radius
  // "hide" (default) — nodes removed from canvas; "Show full graph" button available
  // "dim"            — nodes remain at 15% opacity; hover to inspect individually
  "focusMode": "hide",

  // Which direction to traverse for blast radius computation
  // "downstream" (default) — files that import the changed file, transitively
  // "both"                 — also shows files the changed file imports (upstream), in muted teal
  "blastRadiusDirection": "downstream",

  // Directory base colors — auto-generated on first index, fully overridable.
  // Delete an entry to force regeneration from the hash algorithm on next start.
  "directoryColors": {
    "apps/api": "#7B6FE8",
    "apps/web": "#3DBFA0",
    "packages/contracts": "#D4A847",
    "packages/shared": "#5B9BD5",
  },
}
```

### Electron desktop (`apps/desktop`) — Phase 2

- Electron wraps `apps/web` via `BrowserWindow`.
- Preload IPC bridge exposes: native file picker (repo selection), system tray with status icon, OS notifications when blast radius exceeds a configurable threshold.
- Electron main process spawns `apps/server` as a managed child process. Fully self-contained — no terminal or `npm start` required.
- `electron-updater` for auto-updates from GitHub Releases.
- `electron-vite` for HMR in both main process and renderer during development.

---

## Testing Decisions

**Philosophy:** Tests verify only external behavior and observable outputs, never internal implementation details. A test must survive a complete internal refactor as long as the public interface contract holds.

### `packages/analyzer` — highest priority

Pure functions with deterministic outputs. The most critical correctness surface in the system.

- Given a set of TypeScript source files, the analyzer produces the correct dependency graph (nodes and edges match expected structure).
- Given two consecutive graph states, the diff engine produces the correct `GraphDiff` (additions, removals, modifications accurately identified, including cross-directory edge classification).
- Given a single changed node with `blastRadiusDirection: "downstream"`, BFS traversal returns the complete correct set of downstream nodes — and only those nodes. No upstream nodes appear.
- Given `blastRadiusDirection: "both"`, BFS traversal returns separate downstream and upstream node sets. A node that is both upstream and downstream appears in both lists.
- Multiple changed nodes in a single diff produce a blast radius that is the union of individual blast radii with no duplicates.
- Circular dependencies are detected and present in `GraphDiff.newCircularDeps`.
- A resolved circular dependency appears in `GraphDiff.resolvedCircularDeps` and is absent from `newCircularDeps`.
- TypeScript path aliases are correctly resolved.
- File deletion: node removed, `removedNodes` populated, dangling edges present in `removedEdges`.
- File creation: new node in `addedNodes` with correct outbound edges in `addedEdges`.
- In-degree is correctly computed for all nodes and updates correctly when edges are added or removed.

### `packages/contracts` — schema contract tests

- Every Zod schema accepts valid inputs and rejects invalid inputs with correct error shapes.
- Round-trip: serialize any valid message to JSON and parse it back, assert structural equality.
- `GraphDiff` schema correctly validates both `newCircularDeps` and `resolvedCircularDeps` fields.
- `blastRadius.downstream` and `blastRadius.upstream` are both required arrays (empty when not applicable, never absent).
- All WebSocket message types the server broadcasts have a corresponding schema.

### `apps/server` — integration tests

- Multiple file saves within 500ms produce a single `graph.diff` broadcast, not multiple.
- A single file save produces a `graph.diff` broadcast within 600ms of the save.
- A `.git/COMMIT_EDITMSG` write triggers a `session.reset` broadcast after 500ms.
- A newly introduced circular dependency appears in `GraphDiff.newCircularDeps`.
- A resolved circular dependency appears in `GraphDiff.resolvedCircularDeps`.
- Invalid outbound messages are dropped and logged, not sent.
- Session history written to SQLite survives a server restart and is correctly returned in the next `graph.snapshot`.
- The agent hook endpoint returns 204 and does not affect graph state in Phase 1.
- The server does not write to `.sentinelrc` if the file already contains a `directoryColors` entry for the directory being indexed.

### `packages/shared` — unit tests

- Debounce logic: multiple triggers within the window produce one output; a trigger after the window produces a new output.
- Graph serialization: round-trip serialize and deserialize a Graphology instance, assert structural equality including all node and edge attributes.
- Session summary: correct cumulative counts across a sequence of add, modify, and delete events including multi-file batch events.
- Directory color generation:
  - The same directory path always produces the same hex color on any input (determinism).
  - Generated hues are never within 30 degrees of reserved event hues (green=120, blue=220, red=0, amber=40, orange=25).
  - A color present in `.sentinelrc` is used as-is; the hash algorithm is not called.
  - A directory not in `.sentinelrc` generates a color and the entry is appended without modifying existing entries.

### Testing tools

- **Vitest** across all packages.
- **@vitest/coverage-v8** for coverage reporting.
- Analyzer tests use in-memory Graphology instances and temporary TypeScript fixture files — no real project filesystem required.
- Server integration tests use a real chokidar watcher against a controlled temporary fixture directory created and destroyed per test.
- WebSocket tests use a real WebSocket server bound to a random port — no mocking of the transport layer.

---

## Phase 2 Scope (reference)

The following are out of scope for Phase 1. No Phase 1 architectural decision requires rework to accommodate them — Phase 2 is purely additive.

### AI reviewer (`packages/reviewer`)

Multi-pass code analysis triggered on demand (`⌘R` on a selected node) or automatically on file save (configurable). Each pass uses the Anthropic SDK with streaming enabled. Findings are delivered as structured tool-use output conforming to a `contracts` schema, streamed to the UI in real time.

- **Pass 1 — Logic & bugs**: per-file, runs automatically on every change. Fast.
- **Pass 2 — Security**: runs on files matching auth/input/crypto patterns.
- **Pass 3 — Cross-file coherence**: on-demand only. Verifies all callers of a modified function have been updated consistently.

Findings appear as severity rings on graph nodes (red = error, amber = warning) and in a Review tab added to the existing node detail panel. Symbol-level change tracking in the Symbols tab (which specific functions changed this session, caller counts per changed symbol) is also implemented in Phase 2 using `@typescript-eslint/parser` for AST analysis.

### Electron desktop app (`apps/desktop`)

Self-contained app with native OS integration. No terminal required. Auto-updates via GitHub Releases.

### Claude Code agent hook integration

PreToolUse hooks pre-warm blast radius computation before the filesystem event fires. PostToolUse hooks correlate filesystem changes to specific agent tool calls for attribution in the timeline. Both hooks are registered automatically via `npx sentinel setup` which writes to `.claude/hooks/` in the project directory.
