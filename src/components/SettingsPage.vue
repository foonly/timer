<script setup lang="ts">
import { ref } from "vue";
import ModalDialog from "./ModalDialog.vue";
import { version } from "../../package.json";
import { useAuthStore } from "../authStore";
import { useSyncStore } from "../syncStore";

const authStore = useAuthStore();
const syncStore = useSyncStore();

const mode = ref<"login" | "signup">("login");
const email = ref("");
const password = ref("");
const submitting = ref(false);

const lastSynced = () =>
  syncStore.lastSyncedAt ? new Date(syncStore.lastSyncedAt).toLocaleTimeString() : "never";

const submit = async () => {
  submitting.value = true;
  const ok =
    mode.value === "login"
      ? await authStore.login(email.value, password.value)
      : await authStore.signup(email.value, password.value);
  submitting.value = false;
  if (ok) {
    email.value = "";
    password.value = "";
  }
};
</script>

<template>
  <ModalDialog title="Settings">
    <section class="account">
      <h2>Account</h2>
      <template v-if="authStore.isLoggedIn">
        <p>Signed in as {{ authStore.email }}</p>
        <p class="sync-info">Last synced: {{ lastSynced() }}</p>
        <div class="modal-buttons">
          <button type="button" class="btn-secondary" @click="authStore.logout">Log out</button>
        </div>
      </template>
      <template v-else>
        <form @submit.prevent="submit">
          <div class="form-stack">
            <label>
              Email
              <input type="email" v-model="email" placeholder="Email" required />
            </label>
            <label>
              Password
              <input type="password" v-model="password" placeholder="Password" required />
            </label>
          </div>
          <p class="auth-error" v-if="authStore.authStatus === 'error'">
            {{ authStore.authError }}
          </p>
          <div class="modal-buttons">
            <button type="submit" class="btn-primary" :disabled="submitting">
              {{ mode === "login" ? "Log in" : "Sign up" }}
            </button>
          </div>
        </form>
        <p class="mode-toggle">
          <template v-if="mode === 'login'">
            No account yet? <a href="#" @click.prevent="mode = 'signup'">Sign up</a>
          </template>
          <template v-else>
            Already have an account? <a href="#" @click.prevent="mode = 'login'">Log in</a>
          </template>
        </p>
      </template>
    </section>
    <p class="version">Version {{ version }}</p>
  </ModalDialog>
</template>

<style scoped>
.version {
  padding: 0 1rem;
  opacity: 0.5;
}
.account {
  padding: 0 1rem;

  & h2 {
    margin-bottom: 0.5rem;
  }
}
.sync-info {
  opacity: 0.7;
  font-size: 0.9em;
}
.auth-error {
  color: var(--fht-error-color);
  font-size: 0.9em;
}
.mode-toggle {
  font-size: 0.9em;
  opacity: 0.8;
}
.form-stack {
  padding: 0;

  & label {
    font-size: 0.85rem;
    opacity: 0.8;
  }

  & input {
    margin-top: 0.2rem;
  }
}
</style>
