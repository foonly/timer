import { z } from "zod";

// One immutable, timestamped record per state mutation (add/rename/remove a tag, start/stop a
// timer), keyed by a client-generated `id` (the idempotency key for push) and referencing
// tags/timers by their stable `uuid` rather than the mutable path string used for display/tree
// logic. This is the wire format pushed to and pulled from the backend - see
// /home/niklas/.claude/plans/sleepy-juggling-token.md for the full protocol.

const envelope = z.object({
  id: z.string(),
  deviceId: z.string(),
  timestamp: z.number(),
});

const tagPayloadSchema = z.object({
  uuid: z.string(),
  parentUuid: z.string().nullable(),
  name: z.string(),
  description: z.string(),
  order: z.number(),
});

const tagRemovedPayloadSchema = z.object({
  uuid: z.string(),
});

const timerStartedPayloadSchema = z.object({
  uuid: z.string(),
  // null means this timer isn't attached to any specific tag - it's the root/global timer (see
  // `resolveTagUuid("")` in timerStore.ts), which "pause everything" starts.
  tagUuid: z.string().nullable(),
  positive: z.boolean(),
  start: z.number(),
});

const timerStoppedPayloadSchema = z.object({
  uuid: z.string(),
  end: z.number(),
});

const timerUpdatedPayloadSchema = z.object({
  uuid: z.string(),
  start: z.number(),
  end: z.number(),
  description: z.string(),
  positive: z.boolean(),
});

const timerRemovedPayloadSchema = z.object({
  uuid: z.string(),
});

export const syncEventSchema = z.discriminatedUnion("type", [
  envelope.extend({
    type: z.literal("tag_added"),
    entityId: z.string(),
    payload: tagPayloadSchema,
  }),
  envelope.extend({
    type: z.literal("tag_updated"),
    entityId: z.string(),
    payload: tagPayloadSchema,
  }),
  envelope.extend({
    type: z.literal("tag_removed"),
    entityId: z.string(),
    payload: tagRemovedPayloadSchema,
  }),
  envelope.extend({
    type: z.literal("timer_started"),
    entityId: z.string(),
    payload: timerStartedPayloadSchema,
  }),
  envelope.extend({
    type: z.literal("timer_stopped"),
    entityId: z.string(),
    payload: timerStoppedPayloadSchema,
  }),
  envelope.extend({
    type: z.literal("timer_updated"),
    entityId: z.string(),
    payload: timerUpdatedPayloadSchema,
  }),
  envelope.extend({
    type: z.literal("timer_removed"),
    entityId: z.string(),
    payload: timerRemovedPayloadSchema,
  }),
]);

export type SyncEvent = z.infer<typeof syncEventSchema>;
export type SyncEventType = SyncEvent["type"];

// The shape a pulled event arrives in - the wire event plus the server-assigned monotonic cursor
// position. Never trust `seq` on anything the client itself constructs (see syncService.ts).
export const pulledSyncEventSchema = syncEventSchema.and(z.object({ seq: z.number() }));
export type PulledSyncEvent = z.infer<typeof pulledSyncEventSchema>;
