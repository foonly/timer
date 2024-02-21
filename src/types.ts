import { z } from "zod";

export const tagSchema = z.object({
  name: z.string(),
  description: z.string(),
});
export type timerTag = z.infer<typeof tagSchema>;
