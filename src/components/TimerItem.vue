<script setup lang="ts">
import { useTimerStore } from "../timerStore";
import type { fhtTimer } from "../types";
import TimerName from "./TimerName.vue";
import TimeDisplay from "./TimeDisplay.vue";
import Stop from "../assets/stop.svg";
import Pause from "../assets/pause.svg";
const store = useTimerStore();
defineProps<{ timer: fhtTimer }>();
</script>

<template>
  <div class="timer card">
    <Stop class="icon clickable" @click="store.stopTimer(timer.id)" />
    <Pause class="icon clickable" @click="store.startTimer(timer.id, false)" />
    <TimerName :name="timer.id" />
    <TimeDisplay :time="(timer.end > 0 ? timer.end : store.now) - timer.start" />
  </div>
</template>

<style scoped>
.icon {
  margin: 0.3rem;
  float: right;
}
</style>
