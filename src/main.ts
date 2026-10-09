import { createPinia } from "pinia";
import piniaPluginPersistedstate from "pinia-plugin-persistedstate";
import { createApp } from "vue";
import TimerApp from "./TimerApp.vue";
import "./style.css";
import { initDarkLightMode } from "./darkLight";
import { startClock } from "./clock";
import { useTimerStore } from "./timerStore";
import { useAuthStore } from "./authStore";
import { startSyncEngine } from "./syncService";
import { findRedundantTimers } from "./sanityCheck";

const pinia = createPinia();
pinia.use(piniaPluginPersistedstate);
const app = createApp(TimerApp);

// Add a custom focus directive.
app.directive("focus", {
  mounted(el) {
    // When element is mounted.
    el.focus();
  },
});

app.use(pinia);

// Before mounting, so no component ever renders (or acts on) tags/timers that are missing the
// uuid/updatedAt/order fields migrateUuids backfills.
const timerStore = useTimerStore();
timerStore.migrateUuids();
if (timerStore.tags.length === 0 && !timerStore.wizardPromptDismissed) {
  timerStore.openModal("setup-wizard-prompt");
}

app.mount("#app");

startClock();
initDarkLightMode();

void useAuthStore().checkSession();
startSyncEngine();

const redundantTimers = findRedundantTimers(timerStore.timers);
if (redundantTimers.length > 0) {
  console.warn(
    `Sanity check: found ${redundantTimers.length} redundant timer record(s) - fully covered ` +
      "by another timer on the same tag and direction, so they don't affect any displayed time " +
      "and can be safely removed:",
    redundantTimers,
  );
}
