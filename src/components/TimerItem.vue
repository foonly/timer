<script setup lang="ts">
import { useTimerStore } from "../timerStore";
import type { timerGroup } from "../types";
import TimerName from "./TimerName.vue";
import TimeDisplay from "./TimeDisplay.vue";
import StartEnd from "./StartEnd.vue";
import Play from "../assets/play.svg";
import Stop from "../assets/stop.svg";
import Pause from "../assets/pause.svg";
import Up from "../assets/chevron-up.svg";
import Down from "../assets/chevron-down.svg";
import { computed, ref } from "vue";

const store = useTimerStore();
const props = defineProps<{ timer: timerGroup }>();
const showTime = ref(false);
const status = computed(() => store.getStatus(props.timer.id));
</script>

<template>
  <div class="timer card" :data-status="status">
    <template v-if="store.isRunning(timer.id)">
      <Stop class="icon clickable" title="Stop" @click="store.stopTimer(timer.id)" />
      <Play
        v-if="status === 'paused'"
        class="icon clickable"
        title="Resume"
        @click="store.resumeTimer(timer.id)"
      />
      <Pause
        v-else
        class="icon clickable"
        title="Pause"
        @click="store.startTimer(timer.id, false)"
      />
    </template>
    <TimerName :name="timer.id" :status="status" />
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
