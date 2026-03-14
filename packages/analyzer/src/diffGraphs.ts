import { stronglyConnectedComponents } from "graphology-components";
import type { DirectedGraph } from "graphology";
import type { CircularDep, GraphDiff, GraphEdge, GraphNode } from "@sentinel/contracts";
import { computeBlastRadius } from "./blastRadius";

type NodeAttributes = Omit<GraphNode, "id">;
type EdgeAttributes = Omit<GraphEdge, "source" | "target">;

function getCycles(graph: DirectedGraph): Map<string, CircularDep> {
  const sccs = stronglyConnectedComponents(graph);
  const cycles = new Map<string, CircularDep>();
  for (const scc of sccs) {
    if (scc.length > 1) {
      const id = scc.toSorted().join("|");
      cycles.set(id, { id, cycleNodeIds: scc });
    }
  }
  return cycles;
}

export function diffGraphs(
  previousGraph: DirectedGraph,
  currentGraph: DirectedGraph,
  direction: "downstream" | "both" = "downstream",
): GraphDiff {
  const prevNodes = new Set(previousGraph.nodes());
  const currNodes = new Set(currentGraph.nodes());

  const addedNodeIds = [...currNodes].filter((n) => !prevNodes.has(n));
  const removedNodeIds = [...prevNodes].filter((n) => !currNodes.has(n));
  const commonNodeIds = [...currNodes].filter((n) => prevNodes.has(n));

  const addedNodes: GraphNode[] = addedNodeIds.map((id) => ({
    id,
    ...(currentGraph.getNodeAttributes(id) as NodeAttributes),
  }));

  const modifiedNodes: GraphNode[] = [];
  for (const id of commonNodeIds) {
    const prevAttrs = previousGraph.getNodeAttributes(id) as NodeAttributes;
    const currAttrs = currentGraph.getNodeAttributes(id) as NodeAttributes;
    if (prevAttrs.inDegree !== currAttrs.inDegree) {
      modifiedNodes.push({ id, ...currAttrs });
    }
  }

  // Edge diffing — key edges by source->target for O(1) lookup
  const prevEdgeKeys = new Set(
    previousGraph.edges().map((e) => `${previousGraph.source(e)}->${previousGraph.target(e)}`),
  );
  const currEdgeKeys = new Set(
    currentGraph.edges().map((e) => `${currentGraph.source(e)}->${currentGraph.target(e)}`),
  );

  const addedEdges: GraphEdge[] = currentGraph
    .edges()
    .filter((e) => !prevEdgeKeys.has(`${currentGraph.source(e)}->${currentGraph.target(e)}`))
    .map((e) =>
      Object.assign(
        { source: currentGraph.source(e), target: currentGraph.target(e) },
        currentGraph.getEdgeAttributes(e) as EdgeAttributes,
      ),
    );

  const removedEdges = previousGraph
    .edges()
    .filter((e) => !currEdgeKeys.has(`${previousGraph.source(e)}->${previousGraph.target(e)}`))
    .map((e) => ({ source: previousGraph.source(e), target: previousGraph.target(e) }));

  // Circular dep detection via SCC on both snapshots
  const prevCycles = getCycles(previousGraph);
  const currCycles = getCycles(currentGraph);

  const newCircularDeps = [...currCycles.values()].filter((c) => !prevCycles.has(c.id));
  const resolvedCircularDeps = [...prevCycles.keys()].filter((id) => !currCycles.has(id));

  // Blast radius covers all structurally changed node IDs
  const changedNodeIds = [...addedNodeIds, ...removedNodeIds, ...modifiedNodes.map((n) => n.id)];

  const blastRadius =
    changedNodeIds.length > 0
      ? computeBlastRadius(currentGraph, changedNodeIds, direction)
      : { downstream: [], upstream: [], changedNodeIds: [] };

  return {
    addedNodes,
    removedNodes: removedNodeIds,
    addedEdges,
    removedEdges,
    modifiedNodes,
    blastRadius,
    newCircularDeps,
    resolvedCircularDeps,
  };
}
