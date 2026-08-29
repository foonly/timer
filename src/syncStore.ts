import { defineStore } from "pinia";
import { ref } from "vue";
import type { SyncEvent } from "./sync/events";

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

    // Transient - not persisted, recomputed fresh on every load.
    const syncStatus = ref<SyncStatus>("idle");

    const enqueueEvent = (event: SyncEvent) => {
      pendingEvents.value.push(event);
    };

    return {
      deviceId,
      pendingEvents,
      pullCursor,
      lastSyncedAt,
      hasBootstrapped,
      syncStatus,
      enqueueEvent,
    };
  },
  {
    persist: {
      key: "timer-sync",
      paths: ["deviceId", "pendingEvents", "pullCursor", "lastSyncedAt", "hasBootstrapped"],
    },
  },
);
