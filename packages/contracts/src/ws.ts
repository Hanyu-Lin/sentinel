import { z } from "zod";
import { GraphDiffSchema, GraphNodeSchema, GraphEdgeSchema } from "./graph";
import { BlastRadiusSchema } from "./blastRadius";

// Server → Client messages
export const ServerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("graph.snapshot"),
    nodes: z.array(GraphNodeSchema),
    edges: z.array(GraphEdgeSchema),
  }),
  z.object({
    type: z.literal("graph.diff"),
    diff: GraphDiffSchema,
  }),
  z.object({
    type: z.literal("graph.blastRadius"),
    blastRadius: BlastRadiusSchema,
  }),
  z.object({
    type: z.literal("session.changeEvent"),
    filePath: z.string(),
    timestamp: z.number(),
    blastRadiusCount: z.number(),
    agentToolCall: z.string().optional(),
  }),
  z.object({
    type: z.literal("session.summary"),
    totalFilesChanged: z.number(),
    totalNodesImpacted: z.number(),
    largestBlastRadius: z.number(),
  }),
]);

export type ServerMessage = z.infer<typeof ServerMessageSchema>;

// Client → Server messages
export const ClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("config.update"),
    watchPaths: z.array(z.string()).optional(),
    ignorePaths: z.array(z.string()).optional(),
  }),
  z.object({
    type: z.literal("session.reset"),
  }),
  z.object({
    type: z.literal("pin.node"),
    nodeId: z.string(),
    pinned: z.boolean(),
  }),
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;
