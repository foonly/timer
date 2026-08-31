import { z } from "zod";

export const tagSchema = z.object({
  // Stable sync identity, assigned once when the tag is created and never touched again - unlike
  // `parent`/`name`, which change on rename/reparent and are never used to key sync events.
  uuid: z.string(),
  name: z.string(),
  parent: z.string().default(""),
  description: z.string(),
  updatedAt: z.number().default(() => Date.now()),
});
export type fhtTag = z.infer<typeof tagSchema>;

export const timerDataSchema = z.object({
  description: z.string().default(""),
  positive: z.boolean().default(true),
  start: z.number(),
  end: z.number().default(0),
  updatedAt: z.number().default(() => Date.now()),
});
export type simpleTimer = z.infer<typeof timerDataSchema>;

export const timerSchema = timerDataSchema.extend({
  id: z.string(),
  uuid: z.string(),
});
export type fhtTimer = z.infer<typeof timerSchema>;

export type timerStatus = "running" | "paused" | "sub-running" | "idle";
