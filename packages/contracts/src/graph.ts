import { z } from "zod";

export const GraphNodeSchema = z.object({
  id: z.string(),
  filePath: z.string(),
  directory: z.string(),
  dependentCount: z.number(),
  state: z.enum(["neutral", "changed", "impacted", "circular"]),
});

export type GraphNode = z.infer<typeof GraphNodeSchema>;

export const GraphEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  importStatement: z.string(),
  isCircular: z.boolean(),
});

export type GraphEdge = z.infer<typeof GraphEdgeSchema>;

export const GraphDiffSchema = z.object({
  addedNodes: z.array(GraphNodeSchema),
  removedNodes: z.array(z.string()),
  addedEdges: z.array(GraphEdgeSchema),
  removedEdges: z.array(z.object({ source: z.string(), target: z.string() })),
  modifiedNodes: z.array(GraphNodeSchema),
});

export type GraphDiff = z.infer<typeof GraphDiffSchema>;
