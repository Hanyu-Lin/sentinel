import { z } from "zod";

export const EventTypeSchema = z.enum(["added", "modified", "deleted"]);
export type EventType = z.infer<typeof EventTypeSchema>;

export const SessionEventSchema = z.object({
  id: z.string(),
  filePaths: z.array(z.string()),
  eventTypes: z.array(EventTypeSchema),
  blastRadiusCounts: z.object({
    downstream: z.number(),
    upstream: z.number(),
  }),
  timestamp: z.number(),
});

export type SessionEvent = z.infer<typeof SessionEventSchema>;
