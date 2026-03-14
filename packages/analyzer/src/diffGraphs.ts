import type { GraphDiff } from "@sentinel/contracts";

/**
 * Computes the diff between two graph snapshots, returning
 * added/removed/modified nodes and edges.
 */
export function diffGraphs(
  _previous: { nodes: unknown[]; edges: unknown[] },
  _current: { nodes: unknown[]; edges: unknown[] },
): GraphDiff {
  // TODO: implement Graphology-based diffing
  return {
    addedNodes: [],
    removedNodes: [],
    addedEdges: [],
    removedEdges: [],
    modifiedNodes: [],
  };
}
