import { watch } from "vue";
import { useAuthStore } from "./authStore";
import { useSyncStore } from "./syncStore";
import { useTimerStore } from "./timerStore";
import { pulledSyncEventSchema } from "./sync/events";

const SYNC_INTERVAL_MS = 30_000;
const PUSH_DEBOUNCE_MS = 2_000;
const PUSH_CHUNK_SIZE = 200;
const PULL_LIMIT = 500;

let started = false;
let syncing = false;

async function pushPending(): Promise<void> {
  const syncStore = useSyncStore();
  const authStore = useAuthStore();
  if (syncStore.pendingEvents.length === 0) {
    return;
  }

  const chunk = syncStore.pendingEvents.slice(0, PUSH_CHUNK_SIZE);
  const res = await fetch("/api/sync/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${authStore.token}`,
    },
    body: JSON.stringify({ events: chunk }),
  });
  if (res.status === 401) {
    await authStore.logout();
    throw new Error("unauthorized");
  }
  if (!res.ok) {
    throw new Error(`push failed: ${res.status}`);
  }
  const pushedIds = new Set(chunk.map((e) => e.id));
  syncStore.pendingEvents = syncStore.pendingEvents.filter((e) => !pushedIds.has(e.id));
}

async function pullNew(): Promise<void> {
  const syncStore = useSyncStore();
  const authStore = useAuthStore();
  const timerStore = useTimerStore();

  let hasMore = true;
  while (hasMore) {
    const res = await fetch(`/api/sync/pull?since=${syncStore.pullCursor}&limit=${PULL_LIMIT}`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    });
    if (res.status === 401) {
      await authStore.logout();
      throw new Error("unauthorized");
    }
    if (!res.ok) {
      throw new Error(`pull failed: ${res.status}`);
    }
    const data = (await res.json()) as { events: unknown[]; hasMore: boolean };
    for (const raw of data.events) {
      const event = pulledSyncEventSchema.parse(raw);
      timerStore.applyRemoteEvent(event);
      if (event.seq > syncStore.pullCursor) {
        syncStore.pullCursor = event.seq;
      }
    }
    hasMore = data.hasMore && data.events.length > 0;
  }
}

async function runCycle(): Promise<void> {
  const authStore = useAuthStore();
  const syncStore = useSyncStore();
  if (!authStore.isLoggedIn || syncing) {
    return;
  }
  syncing = true;
  syncStore.syncStatus = "syncing";
  try {
    // Push first, then ALWAYS pull using the cursor as it stood before this cycle - never advance
    // it from anything in the push response. `seq` is a single sequence shared across every
    // device on the account, so a concurrent push from another device can land at a lower seq
    // than this device's own batch; fast-forwarding past our own batch's max seq would silently
    // skip that other device's events forever. Pulling with the real cursor, combined with
    // idempotent apply in applyRemoteEvent, makes re-seeing our own just-pushed events on the
    // next pull a harmless no-op instead.
    await pushPending();
    await pullNew();
    syncStore.lastSyncedAt = Date.now();
    syncStore.syncStatus = "idle";
  } catch (err) {
    syncStore.syncStatus = err instanceof TypeError ? "offline" : "error";
    console.error("Sync failed:", err);
  } finally {
    syncing = false;
  }
}

export function startSyncEngine() {
  if (started) {
    return;
  }
  started = true;

  const authStore = useAuthStore();
  const syncStore = useSyncStore();
  const trigger = () => {
    void runCycle();
  };

  // Every entry point below only ever calls trigger(), and runCycle() bails immediately unless
  // isLoggedIn - so there are zero network calls while logged out, by construction.
  watch(() => authStore.isLoggedIn, trigger, { immediate: true });

  window.setInterval(trigger, SYNC_INTERVAL_MS);
  window.addEventListener("online", trigger);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      trigger();
    }
  });

  // Near-real-time push: every local mutation (tag/timer add/update/remove) calls
  // syncStore.enqueueEvent, growing pendingEvents by exactly one - so watching its length is a
  // precise "a local edit just happened" signal, debounced so a burst of edits (e.g. typing in a
  // description) only fires one sync cycle 2s after the last one. Watching pendingEvents.length
  // rather than tags/timers directly also means this can never fire from a pulled remote event:
  // applyRemoteEvent deliberately never touches pendingEvents (see timerStore.ts), so replaying
  // another device's change can't cause an echo trigger here.
  let debounceHandle = 0;
  watch(
    () => syncStore.pendingEvents.length,
    (newLength, oldLength) => {
      if (newLength <= oldLength) {
        return;
      }
      window.clearTimeout(debounceHandle);
      debounceHandle = window.setTimeout(trigger, PUSH_DEBOUNCE_MS);
    },
  );
}
