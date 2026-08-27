<script setup lang="ts">
import { computed } from "vue";
import { useTimerStore } from "../timerStore";
import StatusDot from "./StatusDot.vue";
import TimeDisplay from "./TimeDisplay.vue";

const store = useTimerStore();
const props = defineProps<{ id: string; time: number; live: boolean }>();

const nameParts = computed(() => props.id.split("//").filter((part) => part));
const status = computed(() => store.getStatus(props.id));
</script>

<template>
  <div class="report-row">
    <span class="name">
      <StatusDot v-if="live" :status="status" />
      <span class="name-part" v-for="part in nameParts" :key="part">{{ part }}</span>
    </span>
    <TimeDisplay class="row-time" :time="time" />
  </div>
</template>

<style scoped>
.report-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.6rem 0;
  border-bottom: 1px solid var(--fht-element-border-color);

  &:last-child {
    border-bottom: none;
  }
}
.name {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.3ch;
  min-width: 0;

  & .status-dot {
    margin-right: 0.2ch;
  }
}
.name-part {
  display: inline-block;
  background-color: var(--fht-element-background-color);
  border-radius: var(--fht-border-radius);
  padding: 0.2ch 0.6ch;
}
.row-time {
  flex: none;
  font-size: 1.1rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
</style>
