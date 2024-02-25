import { z } from "zod";

export const tagSchema = z.object({
  name: z.string(),
  parent: z.string().default(""),
  description: z.string(),
});
export type fhtTag = z.infer<typeof tagSchema>;

export const timerSchema = z.object({
  id: z.string(),
  description: z.string().default(""),
  positive: z.boolean().default(true),
  start: z.number(),
  end: z.number().default(0),
});
export type fhtTimer = z.infer<typeof timerSchema>;
