import { bfsFromNode } from "graphology-traversal";
import type { DirectedGraph } from "graphology";
import type { BlastRadius } from "@sentinel/contracts";

export function computeBlastRadius(
  graph: DirectedGraph,
  changedNodeIds: string[],
  direction: "downstream" | "both" = "downstream",
): BlastRadius {
  const changedSet = new Set(changedNodeIds);
  const downstream = new Set<string>();
  const upstream = new Set<string>();

  for (const nodeId of changedNodeIds) {
    if (!graph.hasNode(nodeId)) continue;

    bfsFromNode(
      graph,
      nodeId,
      (node) => {
        if (!changedSet.has(node)) downstream.add(node);
      },
      { mode: "outbound" },
    );

    if (direction === "both") {
      bfsFromNode(
        graph,
        nodeId,
        (node) => {
          if (!changedSet.has(node)) upstream.add(node);
        },
        { mode: "inbound" },
      );
    }
  }

  return {
    downstream: [...downstream],
    upstream: [...upstream],
    changedNodeIds: [...changedSet],
  };
}
