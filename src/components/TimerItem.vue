<script setup lang="ts">
import { useTimerStore } from "../timerStore";
import type { fhtTimer } from "../types";
import TimerName from "./TimerName.vue";
const store = useTimerStore();
defineProps<{ timer: fhtTimer }>();
</script>

<template>
  <div class="timer">
    <TimerName :name="timer.id" />
    <div>{{ store.now - timer.start }}</div>
  </div>
</template>

<style scoped>
.timer {
  background-color: var(--fht-element-background-color);
  border-radius: var(--fht-border-radius);
}
</style>
