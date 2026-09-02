<script setup lang="ts">
import { computed } from "vue";
import { useTimerStore } from "../timerStore";
import StatusDot from "./StatusDot.vue";
import TimeDisplay from "./TimeDisplay.vue";
import TimerRecordsModal from "./TimerRecordsModal.vue";
import TagPath from "./TagPath.vue";

const store = useTimerStore();
const props = defineProps<{ id: string; time: number; live: boolean }>();

const status = computed(() => store.getStatus(props.id));
</script>

<template>
  <div class="report-row-item">
    <button type="button" class="report-row" @click="store.openModal('records', props.id)">
      <span class="name">
        <StatusDot v-if="live" :status="status" />
        <TagPath :id="props.id" highlight-last />
      </span>
      <TimeDisplay class="row-time" :time="time" />
    </button>
    <TimerRecordsModal v-if="store.isModal('records', props.id)" :id="props.id" />
  </div>
</template>

<style scoped>
.report-row-item:last-child .report-row {
  border-bottom: none;
}
.report-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  width: 100%;
  padding: 0.6rem 0.5rem;
  margin: 0 -0.5rem;
  border: none;
  border-bottom: 1px solid var(--fht-element-border-color);
  border-radius: var(--fht-button-border-radius);
  background: none;
  font: inherit;
  font-weight: normal;
  text-align: left;
  transition: background-color 0.15s ease;

  &:hover,
  &:active {
    background-color: var(--fht-element-border-color);
  }
}
.name {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.3ch;
  min-width: 0;

  & .status-dot {
    margin-right: 0.3ch;
  }
}
.row-time {
  flex: none;
  font-size: 1.1rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
</style>
