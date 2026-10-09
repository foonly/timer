import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useAuthStore } from "./authStore";
import { useSyncStore } from "./syncStore";
import { useTimerStore } from "./timerStore";
import { pullNew } from "./syncService";

const jsonResponse = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>();

beforeEach(() => {
  setActivePinia(createPinia());
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("checkSession", () => {
  it("logs out on 401", async () => {
    const auth = useAuthStore();
    auth.token = "t";
    fetchMock.mockResolvedValueOnce(jsonResponse(401));
    await auth.checkSession();
    expect(auth.token).toBeNull();
    expect(auth.authStatus).toBe("logged-out");
  });

  it("keeps the session on a server error", async () => {
    const auth = useAuthStore();
    auth.token = "t";
    fetchMock.mockResolvedValueOnce(jsonResponse(500));
    await auth.checkSession();
    expect(auth.token).toBe("t");
    expect(auth.authStatus).toBe("logged-in");
  });

  it("backfills an unknown sync account owner", async () => {
    const auth = useAuthStore();
    auth.token = "t";
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { email: "a@example.com" }));
    await auth.checkSession();
    expect(useSyncStore().accountEmail).toBe("a@example.com");
  });
});

describe("login account switching", () => {
  const seedSyncState = (accountEmail: string | null) => {
    const sync = useSyncStore();
    sync.accountEmail = accountEmail;
    sync.pullCursor = 42;
    sync.hasBootstrapped = true;
    sync.pendingEvents = [
      {
        id: "e1",
        type: "tag_removed",
        entityId: "x",
        deviceId: "d",
        timestamp: 1,
        payload: { uuid: "x" },
      },
    ];
    return sync;
  };

  it("resets sync state when logging into a different account", async () => {
    const sync = seedSyncState("a@example.com");
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { token: "t" }));
    await useAuthStore().login("b@example.com", "pw");
    expect(sync.accountEmail).toBe("b@example.com");
    expect(sync.pullCursor).toBe(0);
    // Reset, then freshly bootstrapped (empty local store, so nothing to enqueue).
    expect(sync.pendingEvents).toEqual([]);
    expect(sync.hasBootstrapped).toBe(true);
  });

  it("re-bootstraps local data into the new account", async () => {
    seedSyncState("a@example.com");
    useTimerStore().addTag("", "Work");
    useSyncStore().pendingEvents = [];
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { token: "t" }));
    await useAuthStore().login("b@example.com", "pw");
    expect(useSyncStore().pendingEvents.map((e) => e.type)).toEqual(["tag_added"]);
  });

  it("keeps sync state when logging back into the same account", async () => {
    const sync = seedSyncState("a@example.com");
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { token: "t" }));
    await useAuthStore().login("a@example.com", "pw");
    expect(sync.pullCursor).toBe(42);
    expect(sync.pendingEvents).toHaveLength(1);
  });

  it("keeps sync state when the previous account is unknown", async () => {
    const sync = seedSyncState(null);
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { token: "t" }));
    await useAuthStore().login("b@example.com", "pw");
    expect(sync.pullCursor).toBe(42);
    expect(sync.accountEmail).toBe("b@example.com");
  });
});

describe("pullNew", () => {
  it("skips a malformed event, advances past it and applies the rest", async () => {
    useAuthStore().token = "t";
    const tagAdded = {
      id: "e2",
      type: "tag_added",
      entityId: "u1",
      deviceId: "d",
      timestamp: 1,
      payload: { uuid: "u1", parentUuid: null, name: "Work", description: "", order: 0 },
      seq: 2,
    };
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { events: [{ type: "bogus", seq: 1 }, tagAdded], hasMore: false }),
    );
    await pullNew();
    expect(useSyncStore().pullCursor).toBe(2);
    expect(useTimerStore().tags.map((t) => t.name)).toEqual(["Work"]);
  });

  it("advances past a trailing malformed event", async () => {
    useAuthStore().token = "t";
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { events: [{ seq: 7 }], hasMore: false }));
    await pullNew();
    expect(useSyncStore().pullCursor).toBe(7);
  });
});
