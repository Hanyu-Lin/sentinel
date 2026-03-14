import { z } from "zod";

export const BlastRadiusSchema = z.object({
  sourceNodeId: z.string(),
  affectedNodeIds: z.array(z.string()),
  totalAffected: z.number(),
  timestamp: z.number(),
});

export type BlastRadius = z.infer<typeof BlastRadiusSchema>;
