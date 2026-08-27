<script setup lang="ts">
import ListTags from "./components/ListTags.vue";
import DailyReport from "./components/DailyReport.vue";
import StatusDot from "./components/StatusDot.vue";
import DarkLight from "./assets/dark-light.svg";
import Settings from "./assets/settings.svg";
import { toggleDarkLightMode } from "./darkLight";
import AddTagRow from "./components/AddTagRow.vue";
import type { timerStatus } from "./types";
import { statusLabels } from "./helpers";

const legendStatuses: timerStatus[] = ["running", "paused", "sub-running", "idle"];
</script>

<template>
  <div class="app-root">
    <aside class="icons">
      <DarkLight class="icon clickable" @click="toggleDarkLightMode" />
      <Settings class="icon clickable" />
    </aside>
    <h1>Foonlys Hierarchical Timer</h1>
    <div class="status-legend">
      <span class="status-legend-item" v-for="status in legendStatuses" :key="status">
        <StatusDot :status="status" />{{ statusLabels[status] }}
      </span>
    </div>
    <main id="main-grid">
      <section id="tags-section">
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
}
aside.icons {
  position: absolute;
  right: 1rem;
  top: 1rem;
  opacity: 0.5;
}
.status-legend {
  justify-content: center;
}
</style>
