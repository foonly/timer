<script setup lang="ts">
import { useTimerStore } from "../timerStore";
import TimerItem from "./TimerItem.vue";
const store = useTimerStore();
</script>

<template>
  <div class="timers">
    <TimerItem v-for="timer in store.timers" :timer="timer" :key="timer.id" />
  </div>
</template>

<style scoped></style>
