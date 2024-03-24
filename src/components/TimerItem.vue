<script setup lang="ts">
import { useTimerStore } from "../timerStore";
import type { timerGroup } from "../types";
import TimerName from "./TimerName.vue";
import TimeDisplay from "./TimeDisplay.vue";
import StartEnd from "./StartEnd.vue";
import Stop from "../assets/stop.svg";
import Pause from "../assets/pause.svg";
const store = useTimerStore();
defineProps<{ timer: timerGroup }>();
</script>

<template>
  <div class="timer card">
    <Stop class="icon clickable" @click="store.stopTimer(timer.id)" />
    <Pause class="icon clickable" @click="store.startTimer(timer.id, false)" />
    <TimerName :name="timer.id" />
    <TimeDisplay class="total-time" :time="store.getTime(timer.id)" />
    <section>
      <div v-for="item of timer.timers" :key="item.start">
        <TimeDisplay :time="(item.end > 0 ? item.end : store.now) - item.start" />
        <StartEnd :start="item.start" :end="item.end" />
      </div>
    </section>
  </div>
</template>

<style scoped>
.icon {
  margin: 0.3rem;
  float: right;
}
</style>
