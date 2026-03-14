import type { GraphNode, GraphEdge } from "@sentinel/contracts";

/**
 * Runs dependency-cruiser on the given root path and returns
 * a list of nodes and edges representing the dependency graph.
 */
export function buildGraph(_rootPath: string): { nodes: GraphNode[]; edges: GraphEdge[] } {
  // TODO: integrate dependency-cruiser
  return { nodes: [], edges: [] };
}
