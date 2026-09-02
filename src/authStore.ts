import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { useSyncStore } from "./syncStore";
import { useTimerStore } from "./timerStore";

type AuthStatus = "logged-out" | "checking" | "logged-in" | "error";

// On first successful login/signup on a device that already had local data, upload all of it as
// a batch of synthetic events so nothing is lost. Since pullCursor starts at 0, the very first
// pull that follows also naturally fetches this account's entire pre-existing server history from
// other devices - no special-casing needed there.
function bootstrapSyncIfNeeded() {
  const syncStore = useSyncStore();
  if (syncStore.hasBootstrapped) {
    return;
  }
  const timerStore = useTimerStore();

  const uuidForPath = (path: string) =>
    timerStore.tags.find((t) => `${t.parent}//${t.name}` === path)?.uuid;

  // Parent-before-child, so a child's tag_added never references a parentUuid the other side
  // hasn't seen yet.
  const order: (typeof timerStore.tags)[number][] = [];
  const visit = (parentPath: string) => {
    for (const tag of timerStore.getTags(parentPath)) {
      order.push(tag);
      visit(`${tag.parent}//${tag.name}`);
    }
  };
  visit("");

  for (const tag of order) {
    syncStore.enqueueEvent({
      id: crypto.randomUUID(),
      type: "tag_added",
      entityId: tag.uuid,
      deviceId: syncStore.deviceId,
      timestamp: tag.updatedAt,
      payload: {
        uuid: tag.uuid,
        parentUuid: tag.parent === "" ? null : (uuidForPath(tag.parent) ?? null),
        name: tag.name,
        description: tag.description,
        order: tag.order,
      },
    });
  }

  for (const timer of timerStore.timers) {
    const tagUuid = uuidForPath(timer.id);
    if (!tagUuid) {
      continue; // timer on a since-deleted tag - nothing left to attach it to server-side
    }
    syncStore.enqueueEvent({
      id: crypto.randomUUID(),
      type: "timer_started",
      entityId: timer.uuid,
      deviceId: syncStore.deviceId,
      timestamp: timer.start,
      payload: { uuid: timer.uuid, tagUuid, positive: timer.positive, start: timer.start },
    });
    if (timer.end !== 0) {
      syncStore.enqueueEvent({
        id: crypto.randomUUID(),
        type: "timer_stopped",
        entityId: timer.uuid,
        deviceId: syncStore.deviceId,
        timestamp: timer.end,
        payload: { uuid: timer.uuid, end: timer.end },
      });
    }
  }

  syncStore.hasBootstrapped = true;
}

function errorMessageFor(status: number): string {
  if (status === 401) {
    return "Incorrect email or password.";
  }
  if (status === 409) {
    return "An account with that email already exists.";
  }
  return "Something went wrong - please try again.";
}

// The app must stay fully usable with zero login (local-first, offline) - sync is a strictly
// additive, opt-in layer on top. Kept in its own persisted key, separate from both the timer
// store's and the sync store's, so the bearer token never shares a blob with user data.
export const useAuthStore = defineStore(
  "auth",
  () => {
    const token = ref<string | null>(null);
    const email = ref<string | null>(null);
    const authStatus = ref<AuthStatus>("logged-out");
    const authError = ref("");

    const isLoggedIn = computed(() => !!token.value);

    const authenticate = async (path: "signup" | "login", emailInput: string, password: string) => {
      authStatus.value = "checking";
      authError.value = "";
      try {
        const res = await fetch(`/api/auth/${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: emailInput, password }),
        });
        if (!res.ok) {
          authStatus.value = "error";
          authError.value = errorMessageFor(res.status);
          return false;
        }
        const data = (await res.json()) as { token: string };
        token.value = data.token;
        email.value = emailInput;
        authStatus.value = "logged-in";
        bootstrapSyncIfNeeded();
        return true;
      } catch {
        authStatus.value = "error";
        authError.value = "Could not reach the server.";
        return false;
      }
    };

    const signup = (emailInput: string, password: string) =>
      authenticate("signup", emailInput, password);
    const login = (emailInput: string, password: string) =>
      authenticate("login", emailInput, password);

    const logout = async () => {
      const currentToken = token.value;
      // Cleared immediately so the UI (and the sync engine's isLoggedIn check) flips right away,
      // regardless of whether the network call below succeeds.
      token.value = null;
      email.value = null;
      authStatus.value = "logged-out";
      if (currentToken) {
        try {
          await fetch("/api/auth/logout", {
            method: "POST",
            headers: { Authorization: `Bearer ${currentToken}` },
          });
        } catch {
          // Best-effort - the server session will simply expire on its own.
        }
      }
    };

    const checkSession = async () => {
      if (!token.value) {
        return;
      }
      authStatus.value = "checking";
      try {
        const res = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${token.value}` },
        });
        if (!res.ok) {
          token.value = null;
          email.value = null;
          authStatus.value = "logged-out";
          return;
        }
        const data = (await res.json()) as { email: string };
        email.value = data.email;
        authStatus.value = "logged-in";
      } catch {
        // Network error, not an invalid session - keep the token and let the sync engine retry.
        authStatus.value = "logged-in";
      }
    };

    return {
      token,
      email,
      authStatus,
      authError,
      isLoggedIn,
      signup,
      login,
      logout,
      checkSession,
    };
  },
  {
    persist: {
      key: "timer-auth",
      paths: ["token", "email"],
    },
  },
);
