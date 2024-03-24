<script setup lang="ts">
import { useTimerStore } from "../timerStore";
import TimerItem from "./TimerItem.vue";
const store = useTimerStore();
</script>

<template>
  <section id="timer-section">
    <TimerItem v-for="timer in store.groupedTimers" :timer="timer" :key="timer.id" />
  </section>
</template>

<style scoped></style>
