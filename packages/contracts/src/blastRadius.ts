import { z } from "zod";

export const BlastRadiusSchema = z.object({
  downstream: z.array(z.string()),
  upstream: z.array(z.string()),
  changedNodeIds: z.array(z.string()),
});

export type BlastRadius = z.infer<typeof BlastRadiusSchema>;
