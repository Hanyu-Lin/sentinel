import type { BlastRadius } from "@sentinel/contracts";

/**
 * Given a changed node ID and the current graph, computes
 * all transitively affected nodes (the blast radius).
 */
export function computeBlastRadius(_changedNodeId: string, _graph: unknown): BlastRadius {
  // TODO: implement transitive traversal via graphology-shortest-path
  return {
    sourceNodeId: _changedNodeId,
    affectedNodeIds: [],
    totalAffected: 0,
    timestamp: Date.now(),
  };
}
