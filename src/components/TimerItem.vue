<script setup lang="ts">
import { useTimerStore } from "../timerStore";
import type { fhtTimer } from "../types";
import TimerName from "./TimerName.vue";
import TimeDisplay from "./TimeDisplay.vue";
import Stop from "../assets/stop.svg";
const store = useTimerStore();
defineProps<{ timer: fhtTimer }>();
</script>

<template>
  <div class="timer">
    <Stop class="icon clickable" @click="store.stopTimer(timer.id)" />
    <TimerName :name="timer.id" />
    <TimeDisplay :time="(timer.end > 0 ? timer.end : store.now) - timer.start" />
  </div>
</template>

<style scoped>
.timer {
  background-color: var(--fht-element-background-color);
  border-radius: var(--fht-border-radius);
}
.icon {
  float: right;
}
</style>
