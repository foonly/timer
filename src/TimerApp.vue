<script setup lang="ts">
import { useTimerStore } from "./timerStore";
import ListTags from "./components/ListTags.vue";
import ListTimers from "./components/ListTimers.vue";
import DarkLight from "./assets/dark-light.svg";
import { toggleDarkLightMode } from "./darkLight";
import Plus from "./assets/plus.svg";

const store = useTimerStore();
</script>

<template>
  <div class="app-root">
    <DarkLight class="icon clickable dark-light" @click="toggleDarkLightMode" />
    <h1>Foonlys Hierarchical Timer</h1>
    <main id="main-grid">
      <section id="tags-section">
        <ListTags parent="" />
        <Plus class="icon clickable" @click="store.modal = 'add-tag:'" />
      </section>
      <ListTimers />
    </main>
  </div>
</template>

<style scoped>
h1 {
  text-align: center;
  margin-left: 3rem;
  margin-right: 3rem;
}
.dark-light {
  position: absolute;
  right: 1rem;
  top: 1rem;
  opacity: 0.5;
}
</style>
