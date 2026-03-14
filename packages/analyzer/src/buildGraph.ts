import path from "node:path";
import { minimatch } from "minimatch";
import { DirectedGraph } from "graphology";
import { cruise } from "dependency-cruiser";
import type { IModule } from "dependency-cruiser";
import type { GraphNode, GraphEdge } from "@sentinel/contracts";

type NodeAttributes = Omit<GraphNode, "id">;
type EdgeAttributes = Omit<GraphEdge, "source" | "target">;

export type BuildGraphConfig = {
  exclude?: string[];
  tsConfigPath?: string;
  /** Directory → HSL color string from .sentinelrc. Falls back to FNV-1a if absent. */
  directoryColors?: Record<string, string>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** FNV-1a 32-bit hash → deterministic HSL hue for a directory name. */
function fnv1aHue(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash % 360;
}

function directoryColor(dir: string): string {
  return `hsl(${fnv1aHue(dir)}, 65%, 58%)`;
}

function topLevelDir(filePath: string): string {
  const parts = filePath.split(path.sep);
  return parts.length > 1 ? (parts[0] ?? ".") : ".";
}

/** Returns true if filePath (relative to repo) should be excluded by any user glob. */
function isExcludedByGlob(filePath: string, globPatterns: string[]): boolean {
  const normalised = filePath.split(path.sep).join("/");
  return globPatterns.some((glob) => minimatch(normalised, glob, { matchBase: true }));
}

// ---------------------------------------------------------------------------
// buildGraph
// ---------------------------------------------------------------------------

/**
 * Calls dependency-cruiser on `targetDir` and returns a Graphology DirectedGraph.
 *
 * Node IDs are file paths relative to `targetDir`.
 * `exclude` accepts glob patterns (e.g. `**\/dist\/**`, `**\/*.test.ts`).
 *
 * NOTE: this function temporarily changes `process.cwd()` to `targetDir` so
 * that dependency-cruiser output paths are always relative to `targetDir`,
 * regardless of what cwd was when the caller invoked this function.
 * Concurrent calls to buildGraph are not safe — the AnalyzerService must
 * serialize them (one analysis at a time), which Effect fibers guarantee.
 */
export async function buildGraph(
  targetDir: string,
  config: BuildGraphConfig = {},
): Promise<DirectedGraph> {
  const { exclude = [], tsConfigPath, directoryColors = {} } = config;

  // Resolve tsConfigPath to absolute before we chdir; we'll pass path relative to
  // targetDir to cruise so it finds tsconfig when cwd is targetDir.
  const resolvedTsConfigPath = tsConfigPath ? path.resolve(tsConfigPath) : undefined;
  const tsConfigFileName =
    resolvedTsConfigPath != null
      ? path.relative(targetDir, resolvedTsConfigPath) || "tsconfig.json"
      : undefined;

  // Only pass minimal exclude to cruise; user globs are applied by post-filtering
  // so we don't rely on regex conversion (e.g. **/*.ts is unreliable in exclude.path).
  const cruiseExcludePattern = "node_modules|\\.git";

  const originalCwd = process.cwd();
  process.chdir(targetDir);

  let modules: IModule[];
  try {
    const cruiseResult = await cruise(["."], {
      exclude: { path: cruiseExcludePattern },
      outputType: "json",
      ...(tsConfigFileName != null ? { tsConfig: { fileName: tsConfigFileName } } : {}),
    });
    ({ modules } = JSON.parse(cruiseResult.output as string) as { modules: IModule[] });
  } finally {
    process.chdir(originalCwd);
  }

  const graph = new DirectedGraph<NodeAttributes, EdgeAttributes>();

  // Normalise a path from dep-cruiser output to be relative to targetDir.
  // After chdir, paths are already relative; absolute paths (e.g. from aliased
  // imports) are normalised via path.relative(targetDir, absPath).
  const toRelative = (p: string) =>
    path.isAbsolute(p) ? path.relative(targetDir, p) : p;

  // Pass 1: nodes (post-filter by user globs)
  for (const mod of modules) {
    const filePath = toRelative(mod.source);
    if (graph.hasNode(filePath)) continue;
    if (isExcludedByGlob(filePath, exclude)) continue;

    const dir = topLevelDir(filePath);
    graph.addNode(filePath, {
      filePath,
      directory: dir,
      inDegree: 0,
      baseColor: directoryColors[dir] ?? directoryColor(dir),
      eventColor: null,
      visible: true,
      opacity: 1,
      pinned: false,
    });
  }

  // Pass 2: edges + inDegree (skip if source or target is excluded)
  for (const mod of modules) {
    const source = toRelative(mod.source);
    if (isExcludedByGlob(source, exclude)) continue;

    for (const dep of mod.dependencies) {
      if (dep.couldNotResolve) continue;

      const target = toRelative(dep.resolved);
      if (isExcludedByGlob(target, exclude)) continue;
      if (!graph.hasNode(target)) continue;

      const edgeKey = `${source}->${target}`;
      if (graph.hasEdge(edgeKey)) continue;

      const edgeType: GraphEdge["edgeType"] =
        topLevelDir(source) === topLevelDir(target) ? "intra-directory" : "cross-directory";

      graph.addEdgeWithKey(edgeKey, source, target, {
        edgeType,
        importType: "unknown",
        isCircular: false, // updated in pass 3
      });

      graph.setNodeAttribute(target, "inDegree", graph.getNodeAttribute(target, "inDegree") + 1);
    }
  }

  // Pass 3: mark circular edges via SCC
  const { stronglyConnectedComponents } = await import("graphology-components");
  const sccs = stronglyConnectedComponents(graph);
  const cyclicNodes = new Set<string>();
  for (const scc of sccs) {
    if (scc.length > 1) {
      for (const n of scc) cyclicNodes.add(n);
    }
  }
  graph.forEachEdge((edge, _attrs, source, target) => {
    if (cyclicNodes.has(source) && cyclicNodes.has(target)) {
      graph.setEdgeAttribute(edge, "isCircular", true);
    }
  });

  return graph;
}
