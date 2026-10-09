import { defineStore } from "pinia";
import { ref } from "vue";
import type { SyncEvent, SyncEventType } from "./sync/events";

export type SyncStatus = "idle" | "syncing" | "offline" | "error";

// Kept separate from useTimerStore for the same reason clock.ts's `now` ref lives outside any
// store (see its comment): sync bookkeeping mutates on its own rhythm and shouldn't ride the same
// persistence/$subscribe cycle as user data, and keeping it separate makes "log out" trivially
// independent of "clear my timer data".
export const useSyncStore = defineStore(
  "sync",
  () => {
    // Stable per-install identifier, generated once and persisted. Purely informational on the
    // wire (the server never uses it to filter events) - useful for debugging which device an
    // event came from.
    const deviceId = ref(crypto.randomUUID());

    const pendingEvents = ref<SyncEvent[]>([]);
    // Last server `seq` this device has applied. Only ever advanced by an actual pull response -
    // see syncService.ts for why a push response must never be used to fast-forward this.
    const pullCursor = ref(0);
    const lastSyncedAt = ref<number | null>(null);
    // Guards the one-time "upload everything I already have locally" snapshot on first login.
    const hasBootstrapped = ref(false);
    // The account pendingEvents/pullCursor/hasBootstrapped above belong to. null means unknown
    // (state from before this was tracked) - treated as "same account" so upgrading doesn't
    // trigger a full re-bootstrap.
    const accountEmail = ref<string | null>(null);

    // Transient - not persisted, recomputed fresh on every load.
    const syncStatus = ref<SyncStatus>("idle");

    const enqueueEvent = (event: SyncEvent) => {
      pendingEvents.value.push(event);
    };

    // Builds and queues an event, filling in the envelope fields every event shares.
    const emitEvent = <T extends SyncEventType>(
      type: T,
      entityId: string,
      timestamp: number,
      payload: Extract<SyncEvent, { type: T }>["payload"],
    ) => {
      enqueueEvent({
        id: crypto.randomUUID(),
        type,
        entityId,
        deviceId: deviceId.value,
        timestamp,
        payload,
      } as SyncEvent);
    };

    // Called on every successful login/signup. Sync bookkeeping is per-account: the cursor is a
    // position in one account's event log, and pending events were queued for that account. So
    // switching to a different account starts over from scratch (cursor 0, fresh bootstrap of
    // local data) instead of pushing the previous account's queue and skipping the new account's
    // history. Logging back into the same account keeps everything as-is.
    const claimForAccount = (email: string) => {
      // Compared normalized: the server matches emails case-insensitively, and an accountEmail
      // persisted before that was stored exactly as typed.
      const normalize = (e: string) => e.trim().toLowerCase();
      if (accountEmail.value !== null && normalize(accountEmail.value) !== normalize(email)) {
        pendingEvents.value = [];
        pullCursor.value = 0;
        lastSyncedAt.value = null;
        hasBootstrapped.value = false;
      }
      accountEmail.value = email;
    };

    return {
      deviceId,
      pendingEvents,
      pullCursor,
      lastSyncedAt,
      hasBootstrapped,
      accountEmail,
      syncStatus,
      enqueueEvent,
      emitEvent,
      claimForAccount,
    };
  },
  {
    persist: {
      key: "timer-sync",
      paths: [
        "deviceId",
        "pendingEvents",
        "pullCursor",
        "lastSyncedAt",
        "hasBootstrapped",
        "accountEmail",
      ],
    },
  },
);
