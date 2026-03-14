import type { DirectedGraph } from "graphology";
import type { GraphDiff } from "@sentinel/contracts";
import { buildGraph, type BuildGraphConfig } from "./buildGraph";
import { diffGraphs } from "./diffGraphs";

export { buildGraph } from "./buildGraph";
export { diffGraphs } from "./diffGraphs";
export { computeBlastRadius } from "./blastRadius";
export type { BuildGraphConfig } from "./buildGraph";

/**
 * Full config for the `analyze` orchestrator.
 * `blastRadiusDirection` controls whether `diffGraphs` computes upstream nodes
 * in addition to downstream ones. The server reads this from `.sentinelrc` /
 * `ConfigService` and passes it here; the web client filters what it displays.
 *
 * Default: `"downstream"` — the PRD default. Pass `"both"` to include upstream.
 */
export type AnalyzerConfig = BuildGraphConfig & {
  blastRadiusDirection?: "downstream" | "both";
};

export async function analyze(
  targetDir: string,
  config: AnalyzerConfig = {},
  previousGraph?: DirectedGraph,
): Promise<{ graph: DirectedGraph; diff: GraphDiff | null }> {
  const graph = await buildGraph(targetDir, config);
  const diff =
    previousGraph != null
      ? diffGraphs(previousGraph, graph, config.blastRadiusDirection ?? "downstream")
      : null;
  return { graph, diff };
}
