import { z } from "zod";

export const tagSchema = z.object({
  name: z.string(),
  parent: z.string().default(""),
  description: z.string(),
});
export type fhtTag = z.infer<typeof tagSchema>;

export const timerDataSchema = z.object({
  description: z.string().default(""),
  positive: z.boolean().default(true),
  start: z.number(),
  end: z.number().default(0),
});
export type simpleTimer = z.infer<typeof timerDataSchema>;

export const timerSchema = timerDataSchema.extend({
  id: z.string(),
});
export type fhtTimer = z.infer<typeof timerSchema>;

export const timerGroupSchema = z.object({
  id: z.string(),
  timers: z.array(timerDataSchema),
});
export type timerGroup = z.infer<typeof timerGroupSchema>;
