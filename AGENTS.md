# AGENTS.md

## Task Completion Requirements

- All of `bun fmt`, `bun lint`, and `bun run typecheck` must pass before considering tasks completed.
- NEVER run `bun test`. Always use `bun run test` (runs Vitest).

## Project Snapshot

Sentinel is an always-on live dependency graph for AI agent sessions. It watches a target repository for file changes, maintains a live animated graph of the codebase's dependency structure, and visualizes blast radius propagation in real time as an AI coding agent edits files.

This repository is a VERY EARLY WIP. Proposing sweeping changes that improve long-term maintainability is encouraged.

## Core Priorities

1. Performance first — the graph must update within 2 seconds of a file save.
2. Reliability first — the watcher and WebSocket connection must handle reconnects, rapid edits, and large repos gracefully.
3. Keep behavior predictable under load and during failures (watcher restarts, WebSocket reconnects, partial graph diffs).

If a tradeoff is required, choose correctness and robustness over short-term convenience.

## Maintainability

Long-term maintainability is a core priority. If you add new functionality, first check if there is shared logic that can be extracted to a separate module. Duplicate logic across multiple files is a code smell and should be avoided. Don't be afraid to change existing code. Don't take shortcuts by just adding local logic to solve a problem.

## Package Roles

- `apps/server`: Node.js WebSocket server. Watches the target repository with chokidar, runs the analyzer pipeline on file changes, and broadcasts graph diffs + blast radius results to connected clients over WebSocket.
- `apps/web`: React/Vite UI. Owns the WebGL graph canvas (Sigma.js + Graphology), blast radius animations, detail panels, and client-side state. Connects to the server via WebSocket.
- `packages/contracts`: Shared Zod schemas and TypeScript types for graph nodes/edges, graph diffs, blast radius, and WebSocket protocol messages. Keep this package schema-only — no runtime logic.
- `packages/analyzer`: dependency-cruiser integration, Graphology graph diffing, community detection, and blast radius computation. Pure functions with deterministic outputs.
- `packages/shared`: Shared runtime utilities consumed by both server and web. Uses explicit subpath exports (e.g. `@sentinel/shared/scoring`, `@sentinel/shared/debounce`) — no barrel index.

## Architecture

The server is the single source of truth for the dependency graph. The web client never recomputes the graph — it only applies diffs received from the server.

Pipeline on file save:

1. chokidar detects change (500ms debounce)
2. dependency-cruiser re-analyzes affected scope
3. Graphology diff computed (previous vs. current snapshot)
4. Blast radius computed via transitive traversal
5. Results broadcast over WebSocket (`graph.diff` + `graph.blastRadius`)

The web client maintains a Graphology instance in sync via `graph.snapshot` (initial/reconnect) and `graph.diff` (incremental). Sigma.js renders the graph on a WebGL canvas. ForceAtlas2 layout runs in a Web Worker.

## WebSocket Protocol

All messages are typed via `@sentinel/contracts` Zod schemas.

Server → Client: `graph.snapshot`, `graph.diff`, `graph.blastRadius`, `session.changeEvent`, `session.summary`
Client → Server: `config.update`, `session.reset`, `pin.node`

## Phase 2 (Desktop + AI Reviewer)

- `apps/desktop`: Electron wrapper — preload IPC bridge, system tray, OS notifications, auto-update via electron-updater.
- `packages/reviewer`: Anthropic SDK AI review agent — bug/logic, security, cross-file coherence checks.

Phase 2 packages do not exist yet. Do not create them unless explicitly asked.
