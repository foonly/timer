<script setup lang="ts">
import { computed } from "vue";
import { useAuthStore } from "../authStore";
import { useSyncStore } from "../syncStore";
import { useTimerStore } from "../timerStore";
import IconButton from "./IconButton.vue";

const authStore = useAuthStore();
const syncStore = useSyncStore();
const timerStore = useTimerStore();

type SyncState = "logged-out" | "synced" | "syncing" | "pending" | "offline" | "error";

const state = computed<SyncState>(() => {
  if (!authStore.isLoggedIn) {
    return "logged-out";
  }
  if (syncStore.syncStatus === "error") {
    return "error";
  }
  if (syncStore.syncStatus === "offline") {
    return "offline";
  }
  if (syncStore.syncStatus === "syncing") {
    return "syncing";
  }
  return syncStore.pendingEvents.length > 0 ? "pending" : "synced";
});

const label = computed(() => {
  switch (state.value) {
    case "logged-out":
      return "Not signed in - sync is off";
    case "synced":
      return "Synced";
    case "syncing":
      return "Syncing...";
    case "pending":
      return `${syncStore.pendingEvents.length} change(s) waiting to sync`;
    case "offline":
      return "Offline - changes saved locally";
    case "error":
      return "Sync error";
    default:
      return "";
  }
});
</script>

<template>
  <IconButton :label="label" @click="timerStore.openModal('settings')">
    <span class="sync-status" :class="state"></span>
  </IconButton>
</template>

<style scoped>
.sync-status {
  display: inline-block;
  width: 0.65rem;
  height: 0.65rem;
  border-radius: 50%;
  background-color: var(--fht-status-idle);

  &.synced {
    background-color: var(--fht-status-running);
  }
  &.syncing {
    background-color: var(--fht-status-sub-running);
    animation: status-pulse 1.6s ease-in-out infinite;
  }
  &.pending,
  &.offline {
    background-color: var(--fht-status-paused);
  }
  &.error {
    background-color: var(--fht-error-color);
  }
}
</style>
