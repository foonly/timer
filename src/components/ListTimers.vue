<script setup lang="ts">
import { computed } from "vue";
import { useTimerStore } from "../timerStore";
import TimerItem from "./TimerItem.vue";
const store = useTimerStore();

const timers = computed(() => {
  return store.timers.filter((timer) => timer.end === 0);
});
</script>

<template>
  <section id="timer-section">
    <TimerItem v-for="timer in timers" :timer="timer" :key="timer.id" />
  </section>
</template>

<style scoped></style>
