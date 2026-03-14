import { z } from "zod";
import { BlastRadiusSchema } from "./blastRadius";

export const CircularDepSchema = z.object({
  id: z.string(),
  cycleNodeIds: z.array(z.string()),
});

export type CircularDep = z.infer<typeof CircularDepSchema>;

export const GraphNodeSchema = z.object({
  id: z.string(),
  filePath: z.string(),
  directory: z.string(),
  inDegree: z.number().int(),
  baseColor: z.string(),
  eventColor: z.string().nullable(),
  visible: z.boolean(),
  opacity: z.number(),
  pinned: z.boolean(),
});

export type GraphNode = z.infer<typeof GraphNodeSchema>;

export const GraphEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  edgeType: z.enum(["intra-directory", "cross-directory"]),
  importType: z.enum(["named", "default", "side-effect", "unknown"]).optional(),
  isCircular: z.boolean(),
});

export type GraphEdge = z.infer<typeof GraphEdgeSchema>;

export const GraphDiffSchema = z.object({
  addedNodes: z.array(GraphNodeSchema),
  removedNodes: z.array(z.string()),
  addedEdges: z.array(GraphEdgeSchema),
  removedEdges: z.array(z.object({ source: z.string(), target: z.string() })),
  modifiedNodes: z.array(GraphNodeSchema),
  blastRadius: BlastRadiusSchema,
  newCircularDeps: z.array(CircularDepSchema),
  resolvedCircularDeps: z.array(z.string()),
});

export type GraphDiff = z.infer<typeof GraphDiffSchema>;
