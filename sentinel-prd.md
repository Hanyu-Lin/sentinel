# Sentinel — Product Requirements Document

## Problem Statement

AI coding agents (Claude Code, Cursor, Copilot, Codex) are becoming a primary driver of code changes in modern development workflows. These agents edit files autonomously, often across many modules simultaneously, with no mechanism for the developer to understand the structural consequences of those edits in real time.

Existing review tools (CodeRabbit, Greptile, GitHub code review) are **post-hoc and PR-gated** — they only run once changes are committed. By that point, an AI agent may have introduced cascading dependency breakages across dozens of files that are expensive to untangle.

Solo developers working locally with AI agents have no live visibility into:

- Which files have changed and what depends on them
- How large the blast radius of a given edit actually is
- Whether a change has created new circular dependencies or broken structural contracts between modules
- How the agent's edits are propagating through the codebase in real time

The result is that developers either pause frequently to mentally trace dependency chains themselves — negating much of the agent's productivity gain — or let the agent run freely and discover structural breakages only when the build fails or tests break.

---

## Solution

**Sentinel** is an always-on live dependency graph for AI agent sessions. It runs alongside the developer's editor as a local server with a web or desktop UI, watches the target repository for file changes, and maintains a live animated graph of the codebase's dependency structure.

When an AI agent modifies a file, Sentinel:

1. Detects the change via filesystem watcher (within seconds of save)
2. Re-analyzes the affected portion of the dependency graph incrementally
3. Computes the blast radius — every module transitively affected by the change
4. Animates the impact propagation on the live WebGL graph canvas
5. Updates node visual states (changed, impacted, circular) in real time

The developer sees their codebase as a living map — nodes lighting up and edges pulsing as the agent works — providing structural awareness without interrupting the agent's flow.

**Incremental rollout:**

- **Phase 1 (MVP):** Live dependency graph + blast radius animation. Pure structural visibility. No AI review. Solo dev, local only.
- **Phase 2:** AI reviewer (bug/logic, security, cross-file coherence). Desktop Electron app. Agent hook integration.

Sentinel is not a replacement for the AI agent. It is the solo developer's spatial awareness while the agent works.

---

## User Stories

### Setup & Onboarding

1. As a solo developer, I want to point Sentinel at a repository with a single command, so that I can start a watching session without reading documentation.
2. As a developer, I want Sentinel to auto-detect my TypeScript config and path aliases, so that the dependency graph resolves correctly without manual configuration.
3. As a developer, I want to configure which directories and file patterns Sentinel watches and ignores, so that generated files, fixtures, and node_modules don't pollute the graph.
4. As a developer, I want my configuration stored in a committed `.sentinelrc` file at the repo root, so that setup is repeatable across machines.
5. As a developer, I want Sentinel to open the UI automatically in my browser when the server starts, so that I don't have to manually navigate to a localhost URL.
6. As a developer, I want Sentinel to show a clear status indicator (watching / idle / error) in the UI, so that I always know whether the watcher is active.

### Live Dependency Graph

7. As a solo developer using an AI agent locally, I want to see my repository's full dependency graph rendered as an interactive WebGL canvas, so that I have a structural map of my codebase at all times while the agent is editing.
8. As a developer, I want the graph to show files as nodes and import relationships as directed edges, so that I can see which modules depend on which.
9. As a developer, I want the graph to update within two seconds of a file being saved, so that I can see structural consequences before issuing the next agent instruction.
10. As a developer, I want the initial graph layout to use ForceAtlas2 so that tightly coupled clusters of files naturally group together, making the codebase's architecture visually legible.
11. As a developer, I want nodes to be automatically clustered by their directory or package, so that the graph reflects my project's actual structure rather than a flat collection of files.
12. As a developereen a high-level overview and a focused view of a specific module cluster.
13. As a developer, I want to drag individual nodes to reposition them, so that I can manually arrange areas of the graph important to my current task.
14. As a developer, I want my layout positions and zoom level to persist between sessions, so that I don't have to re-navigate every time I restart Sentinel.
15. As a developer, I want to search the graph by filename, so that I can jump directly to any node without manually panning.
16. As a developer, I want to filter the graph to show only a specific package or directory, so that I can reduce visual noise when the agent is working in a focused area.
17. As a developer, I want node sizes to scale with the number of dependents, so that high-impact hub files are visually prominent without me needing to inspect each node.

### Blast Radius & Change Visualization

18. As a developer, I want changed nodes to visually pulse or highlight the moment a file is saved, so that I immediately see which part of the graph the agent just touched.
19. As a developer, I want edges to animate outward from a changed node to its dependents to show dependency propagation, so that I can watch the blast radius expand visually rather than reading a list.
20. As a developer, I want directly changed files and transitively impacted files to use distinct visual treatments (different colors or intensity), so that I can distinguish first-order from second-order effects at a glance.
21. As a developer, I want to see a numeric blast radius count displayed on or near a changed node (e.g. "14 affected"), so that I have an immediate quantitative measure of how wide the impact is.
22. As a developer, I want the blast radius highlight to fade out gradually after a configurable idle timeout, so that the graph returns to a calm baseline between agent edits rather than accumulating stale highlights.
23. As a developer, I want to click a changed or impacted node to pin its blast radius highlight open, so that I can keep a specific change's context visible while I think about it.
24. As a developer, I want to switch to a radial layout centered on the most recently changed file, so that I can see its full dependency web in a spoke-and-hub view optimized for blast radius analysis.
25. As a developer, I want a timeline strip at the bottom of the canvas showing the last N file change events in chronological order, so that I can review the sequence of edits the agent has made this session.
26. As a developer, I want to click any item in the timeline to re-highlight that change event on the graph, so that I can revisit a past edit without restarting the session.

### Node & Edge Detail

27. As a developer, I want to hover over any node to see a tooltip showing its filename, package, number of direct dependents, and current state, so that I can get context without a full click-through.
28. As a developer, I want to click any node to open a detail panel showing its full import list, the full list of modules that import it, and its change history in this session, so that I can investigate any file's structural role thoroughly.
29. As a developer, I want to hover over any edge to see which specific import statement it represents, so that I understand the nature of a dependency relationship.
30. As a developer, I want newly created files to animate into the graph as new nodes, so that I can see when the agent is adding modules to the codebase.
31. As a developer, I want deleted files to animate out of the graph with their edges dissolving, so that I can see when the agent removes modules and which dependencies are now dangling.

### Circular Dependency Detection

32. As a developer, I want circular dependencies to be visually distinguished with red edges, so that I immediately notice if the agent has introduced one.
33. As a developer, I want a toast notification to appear when a new circular dependency is detected, so that I'm alerted even if I'm not looking at the relevant part of the graph.
34. As a developer, I want to click a circular dependency edge to see the full cycle path listed (A → B → C → A), so that I can understand exactly which files are involved without leaving the UI.
35. As a developer, I want circular dependencies to remain visually flagged even after the blast radius animation fades, so that they persist as a warning state until I resolve them.

### Cluster & Layout Modes

36. As a developer, I want to switch between cluster modes — by directory, by blast radius ring depth, by coupling density — so that I can reframe the graph around whatever question I'm currently investigating.
37. As a developer, I want to switch between layout modes — force-directed (default), hierarchical (import chain top-down), radial (selected node at center) — so that I can choose the most legible view for a given analysis task.
38. As a developer, I want layout transitions to animate smoothly when I switch modes, so that spatial continuity is preserved and I don't lose my sense of where nodes are.
39. As a developer, I want the graph to run an anti-overlap pass after layout computation, so that dense clusters remain readable and nodes don't stack on top of each other.

### Agent Hook Integration

40. As a developer using Claude Code, I want Sentinel to register a PreToolUse hook so it receives advance notice of which file the agent is about to edit, so that blast radius analysis is pre-computed and ready the instant the filesystem change arrives.
41. As a developer using Claude Code, I want Sentinel to register a PostToolUse hook so it can correlate filesystem changes back to the specific agent tool call that caused them, so that the change timeline can attribute each edit to the correct agent action.
42. As a developer, I want agent hook integration to be optional and additive — Sentinel must work fully via filesystem watching alone — so that it functions with any agent that writes files regardless of hook support.
43. As a developer, I want the change timeline to show which agent tool call triggered each edit (when hook data is available), so that I can understand the agent's intent behind each structural modification.

### Session Awareness

44. As a developer, I want a live session summary panel showing total files changed, total unique nodes impacted, and largest single blast radius in this session, so that I have a high-level picture of the agent's cumulative impact.
45. As a developer, I want the session summary to update in real time as the agent makes more changes, so that I can watch the scope of the session grow.
46. As a developer, I want to reset the session counters and highlights without restarting Sentinel, so that I can start a clean visual slate for a new agent task within the same project.
47. As a developer, I want the session change history to be persisted to disk, so that I can review what the agent did in a previous session after restarting Sentinel.

### Desktop App — Phase 2

48. As a developer, I want Sentinel to be available as a standalone desktop app, so that I don't need to keep a terminal window open to use it.
49. As a developer, I want the desktop app to remember recently watched repositories and let me switch between them from a menu, so that I can move between projects without reconfiguring.
50. As a developer, I want the desktop app to show a tray icon indicating Sentinel's current status (watching, idle, change detected), so that I know it's running without the window needing focus.
51. As a developer, I want the desktop app to send a native OS notification when a large blast radius change is detected (configurable threshold), so that I'm alerted even when the Sentinel window is in the background.
52. As a developer, I want the desktop app to auto-update, so that I always have the latest capabilities without manual reinstalls.

### AI Reviewer — Phase 2

53. As a developer, I want changed files to be automatically queued for AI review on every save, so that I get feedback without manually triggering anything.
54. As a developer, I want AI review results to stream back to the UI progressively, so that findings appear as they are generated rather than waiting for a full batch.
55. As a developer, I want nodes currently being reviewed to show a distinct shimmer animation, so that I can see which files are actively being analyzed.
56. As a developer, I want nodes with AI findings to be color-coded by severity (warning = yellow, error = red, info = blue), so that I can triage issues at a glance from the graph.
57. As a developer, I want to open a review panel for any flagged node showing the full finding with line references, explanation, and suggested fix, so that I can act on feedback immediately.
58. As a developer, I want the AI reviewer to detect logic errors and potential bugs in changed files, so that I catch issues the agent introduced before they reach a PR.
59. As a developer, I want the AI reviewer to fla, I want to zoom and pan the graph fluidly, so that I can navigate betwg security vulnerabilities in changed files, so that I don't accidentally ship a security issue introduced by an agent.
60. As a developer, I want the AI reviewer to perform a cross-file coherence check verifying that all callers of a modified function have been updated consistently, so that I catch silent contract breakages the agent didn't address.
61. As a developer, I want to bring my own Anthropic API key, so that I control the model and cost.
62. As a developer, I want to configure which review passes are enabled and whether they run automatically on save or only on demand, so that I can tune the tool to my preferred balance of depth and speed.

---

## Implementation Decisions

### Monorepo Architecture

- **Turborepo + Bun** monorepo with the following workspace structure:
  - `apps/web` — React 19 + Vite frontend (graph canvas + detail panels)
  - `apps/server` — Node.js WebSocket server (file watcher + analysis orchestrator)
  - `apps/desktop` — Electron wrapper (Phase 2)
  - `packages/contracts` — Zod schemas for all WebSocket message types. Schema-only, zero runtime logic.
  - `packages/analyzer` — dependency-cruiser + Graphology graph diffing + blast radius engine
  - `packages/reviewer` — Anthropic SDK AI review agent (Phase 2)
  - `packages/shared` — shared utilities, impact scoring, graph serialization helpers

- Strict layer separation: each package has a single responsibility and a stable external interface. The server and desktop app both import `packages/analyzer` and `packages/reviewer` directly — shared code, not HTTP calls between processes.

### Server (`apps/server`)

- **chokidar** watches the target repository. On file save, a debounced pipeline triggers (default: 500ms debounce to batch rapid sequential saves).
- The pipeline is: detect changed files → run dependency-cruiser on the affected scope → diff the Graphology graph (previous snapshot vs. new) → compute blast radius via transitive traversal → broadcast results over WebSocket.
- **WebSocket messages** are typed via `packages/contracts` Zod schemas. All outbound messages are validated before broadcast.
- **Bun's native SQLite** (`bun:sqlite`) persists the session change history so the timeline survives page reloads without a separate database process.
- **Agent hook endpoint**: an optional HTTP endpoint accepts Claude Code PreToolUse/PostToolUse payloads. This is additive — the filesystem watcher is always the primary trigger.

### Analyzer (`packages/analyzer`)

- **dependency-cruiser** produces the raw dependency graph as JSON. Configured to respect the project's tsconfig path aliases and exclude patterns from `.sentinelrc`.
- **Graphology** is the canonical in-memory graph data structure. The analyzer maintains a `previousGraph` snapshot and a `currentGraph`. On each cycle it diffs the two producing a typed `GraphDiff` object: `{ addedNodes, removedNodes, addedEdges, removedEdges, modifiedNodes }`.
- **graphology-communities-louvain** runs community detection to produce cluster assignments. Re-runs when the graph structure changes significantly — not on every single-file save.
- **graphology-shortest-path** computes the blast radius: all nodes reachable from a changed node following dependency edges.
- **graphology-metrics** computes betweenness centrality to identify hub files (high-risk nodes that many others depend on), used to scale node sizes in the UI.
- All output types (`GraphDiff`, `BlastRadius`, `GraphNode`, `GraphEdge`) are defined in `packages/contracts`.

### WebSocket Protocol

All messages are typed via `packages/contracts` Zod schemas.

Server → client messages:

- `graph.snapshot` — full serialized graph on initial connection or reconnection
- `graph.diff` — incremental node/edge changes
- `graph.blastRadius` — blast radius payload for a specific change event
- `session.changeEvent` — a single file change entry (path, timestamp, agent tool call if available, blast radius count)
- `session.summary` — rolling session stats update

Client → server messages:

- `config.update` — change watch settings at runtime
- `session.reset` — clear session counters and highlights
- `pin.node` — pin a node's blast radius highlight open

### Graph UI (`apps/web`)

- **Sigma.js** is the WebGL graph renderer. **@react-sigma/core** provides React lifecycle bindings (mount, unmount, event handlers).
- **Graphology** is the client-side graph data model, kept in sync with the server via `graph.snapshot` and `graph.diff` WebSocket messages. The client never recomputes the graph — it only applies diffs.
- **graphology-layout-forceatlas2** runs the layout algorithm in a **Web Worker** to avoid blocking the UI thread. Layout runs incrementally on diff — only nodes affected by a change are repositioned, not the full graph.
- **graphology-layout-noverlap** runs an anti-overlap pass after ForceAtlas2 to prevent dense clusters from stacking.
- Node visual state is stored as a `state` attribute on each Graphology node (`neutral` | `changed` | `impacted` | `circular`). Sigma's custom node renderer reads this attribute and applies the correct color, size multiplier, and animation.
- **sigma-animation** handles smooth transitions between node states (color interpolation over ~300ms) so state changes feel live rather than jarring.
- **zustand** manages all client-side state: the Graphology instance, selected node, active cluster mode, active layout mode, filter state, pinned nodes, session summary, timeline events.
- **framer-motion** handles all animations outside the canvas: detail panel slide-in, toast notifications, timeline strip, cluster mode transition overlays.
- **@tanstack/react-query** fetches the initial graph snapshot and session history on mount. All subsequent graph updates arrive via WebSocket.
- **@tanstack/react-router** handles routing between the main graph view, session history, and settings.
- **Tailwind CSS v4 + shadcn/ui** for all non-canvas UI components.

### Electron Desktop (`apps/desktop`) — Phase 2

- Electron wraps `apps/web` via `BrowserWindow`.
- A preload script exposes an IPC bridge (`contextBridge`) for native capabilities: file dialog to select the target repo, system tray icon, OS notifications for large blast radius events.
- The Electron main process spawns `apps/server` as a child process — the desktop app is fully self-contained with no separate terminal required.
- `electron-updater` handles auto-updates from GitHub Releases.
- `electron-vite` for fast HMR during development of both the main process and renderer.

---

## Testing Decisions

**Philosophy**: tests verify only external behavior and observable outputs, never internal implementation details. A test must survive a complete internal refactor as long as the public interface contract holds.

### Modules to Test

**`packages/analyzer`** — highest priority. Pure functions with deterministic outputs. The most critical correctness surface in the entire system.

- Given a set of TypeScript source files, the analyzer produces the correct dependency graph (expected nodes and edges).
- Given two consecutive graph states, the diff engine produces the correct `GraphDiff` (added/removed nodes and edges accurately identified).
- Given a changed node, the blast radius computation returns the correct complete set of transitively affected nodes.
- Circular dependencies are detected and present in the graph output.
- TypeScript path aliases configured in tsconfig are correctly resolved.
- The analyzer correctly handles file deletion (node removed, dangling edges cleaned up).
- The analyzer correctly handles file creation (new node added with correct edges).

**`packages/contracts`** — schema contract tests:

- Every defined Zod schema correctly accepts valid inputs and rejects invalid inputs.
- Round-trip test: serialize a valid message to JSON and parse it back, assert structural equality.
- Any message that would be broadcast over WebSocket must pass schema validation.

**`apps/server`** — integration tests:

- A file save event triggers a `graph.diff` WebSocket broadcast with the correct diff within the debounce window.
- A newly introduced circular dependency triggers a graph update that correctly identifies the cycle.
- WebSocket messages are validated against `contracts` schemas before broadcast (invalid messages are logged and dropped, not sent).
- Session history is correctly written to and read from SQLite across a server restart.

**`packages/shared`** — unit tests for all utility functions: impact scoring, debounce logic, graph serialization helpers, session summary computation.

**`packages/reviewer`** (Phase 2):

- Review findings conform to the `contracts` Zod schema (parse without throwing).
- The reviewer correctly returns no findings for an empty diff.
- `p-limit` concurrency is respected — no more than N concurrent Anthropic API calls at once.
- Unit tests mock the Anthropic SDK with `vi.mock`. Integration tests against the real API are tagged `[slow]` and excluded from the default test run.

### Testing Tools

- **Vitest** across all packages.
- **@vitest/coverage-v8** for coverage reports.
- In-memory Graphology instances in all analyzer tests — no filesystem I/O required.
