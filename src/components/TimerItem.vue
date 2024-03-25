<script setup lang="ts">
import { useTimerStore } from "../timerStore";
import type { timerGroup } from "../types";
import TimerName from "./TimerName.vue";
import TimeDisplay from "./TimeDisplay.vue";
import StartEnd from "./StartEnd.vue";
import Stop from "../assets/stop.svg";
import Pause from "../assets/pause.svg";
import Up from "../assets/chevron-up.svg";
import Down from "../assets/chevron-down.svg";
import { ref } from "vue";

const store = useTimerStore();
defineProps<{ timer: timerGroup }>();
const showTime = ref(false);
</script>

<template>
  <div class="timer card">
    <Stop class="icon clickable" @click="store.stopTimer(timer.id)" />
    <Pause class="icon clickable" @click="store.startTimer(timer.id, false)" />
    <TimerName :name="timer.id" />
    <TimeDisplay class="total-time" :time="store.getTime(timer.id)" />
    <Down v-if="!showTime" class="icon clickable" @click="showTime = true" />
    <Up v-else class="icon clickable" @click="showTime = false" />
    <section class="details" v-if="showTime">
      <div class="item" v-for="item of timer.timers" :key="item.start">
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
.total-time {
  font-size: 1.2em;
}
.details {
  border: 1px solid var(--fht-background-color);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 1rem;
}
.item {
  display: flex;
  justify-content: space-between;
}
</style>
