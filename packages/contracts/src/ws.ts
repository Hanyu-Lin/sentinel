import { z } from "zod";
import { GraphDiffSchema, GraphNodeSchema, GraphEdgeSchema, CircularDepSchema } from "./graph";
import { SessionEventSchema, EventTypeSchema } from "./session";

// Server → Client messages
export const ServerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("graph.snapshot"),
    nodes: z.array(GraphNodeSchema),
    edges: z.array(GraphEdgeSchema),
    sessionHistory: z.array(SessionEventSchema),
    activeCircularDeps: z.array(CircularDepSchema),
  }),
  z.object({
    type: z.literal("graph.diff"),
    diff: GraphDiffSchema,
  }),
  z.object({
    type: z.literal("session.changeEvent"),
    id: z.string(),
    filePaths: z.array(z.string()),
    eventTypes: z.array(EventTypeSchema),
    timestamp: z.number(),
    blastRadius: z.object({
      downstream: z.number(),
      upstream: z.number(),
    }),
  }),
  z.object({
    type: z.literal("session.summary"),
    filesAdded: z.number(),
    filesModified: z.number(),
    filesDeleted: z.number(),
    uniqueDownstreamNodes: z.number(),
  }),
  z.object({
    type: z.literal("session.reset"),
  }),
  z.object({
    type: z.literal("indexing.progress"),
    filesDiscovered: z.number(),
    currentFile: z.string().optional(),
    done: z.boolean(),
  }),
]);

export type ServerMessage = z.infer<typeof ServerMessageSchema>;

// Client → Server messages
export const ClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("config.update"),
    targetDir: z.string().optional(),
    exclude: z.array(z.string()).optional(),
    focusMode: z.enum(["hide", "dim"]).optional(),
    blastRadiusDirection: z.enum(["downstream", "both"]).optional(),
  }),
  z.object({
    type: z.literal("session.reset"),
  }),
  z.object({
    type: z.literal("node.togglePin"),
    nodeId: z.string(),
  }),
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;
