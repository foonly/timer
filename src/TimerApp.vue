<script setup lang="ts">
import ListTags from "./components/ListTags.vue";
import DailyReport from "./components/DailyReport.vue";
import StatusDot from "./components/StatusDot.vue";
import SettingsPage from "./components/SettingsPage.vue";
import SyncStatus from "./components/SyncStatus.vue";
import DarkLight from "./assets/dark-light.svg";
import Settings from "./assets/settings.svg";
import Pause from "./assets/pause.svg";
import Resume from "./assets/resume.svg";
import { toggleDarkLightMode } from "./darkLight";
import AddTagRow from "./components/AddTagRow.vue";
import IconButton from "./components/IconButton.vue";
import type { timerStatus } from "./types";
import { statusLabels } from "./helpers";
import { useTimerStore } from "./timerStore";

const legendStatuses: timerStatus[] = ["running", "paused", "sub-running", "idle"];
const store = useTimerStore();
</script>

<template>
  <div class="app-root">
    <aside class="icons">
      <SyncStatus />
      <IconButton label="Toggle dark/light mode" @click="toggleDarkLightMode">
        <DarkLight class="icon" />
      </IconButton>
      <IconButton label="Settings" @click="store.openModal('settings')">
        <Settings class="icon" />
      </IconButton>
    </aside>
    <SettingsPage v-if="store.isModal('settings')" />
    <h1>Foonlys Hierarchical Timer</h1>
    <div class="status-legend">
      <span class="status-legend-item" v-for="status in legendStatuses" :key="status">
        <StatusDot :status="status" />{{ statusLabels[status] }}
      </span>
    </div>
    <main id="main-grid">
      <section id="tags-section">
        <div class="root-controls">
          <button v-if="!store.isPausedNow('')" @click="store.startTimer('', false)">
            <Pause class="icon" /> Pause all
          </button>
          <button v-else @click="store.resumeTimer('')"><Resume class="icon" /> Resume all</button>
        </div>
        <ListTags parent="" />
        <AddTagRow parent="" />
      </section>
      <DailyReport />
    </main>
  </div>
</template>

<style scoped>
h1 {
  text-align: center;
  margin-left: 3rem;
  margin-right: 3rem;

  @media screen and (max-width: 480px) {
    margin-left: 0.5rem;
    margin-right: 0.5rem;
  }
}
aside.icons {
  position: absolute;
  right: 1rem;
  top: 1rem;
  align-items: center;

  @media screen and (max-width: 480px) {
    position: static;
    justify-content: flex-end;
    margin-bottom: 0.5rem;
  }
}
.status-legend {
  justify-content: center;
}
.root-controls {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 0.75rem;
}
.root-controls button {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}
.root-controls .icon {
  width: 18px;
  height: 18px;
}
</style>
