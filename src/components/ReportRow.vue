<script setup lang="ts">
import { computed } from "vue";
import { useTimerStore } from "../timerStore";
import StatusDot from "./StatusDot.vue";
import TimeDisplay from "./TimeDisplay.vue";
import TimerRecordsModal from "./TimerRecordsModal.vue";

const store = useTimerStore();
const props = defineProps<{ id: string; time: number; live: boolean }>();

const nameParts = computed(() => props.id.split("//").filter((part) => part));
const status = computed(() => store.getStatus(props.id));
</script>

<template>
  <div class="report-row clickable" @click="store.openModal('records', props.id)">
    <span class="name">
      <StatusDot v-if="live" :status="status" />
      <span class="crumb" v-for="(part, i) in nameParts" :key="part">
        <span class="separator" v-if="i > 0">›</span>
        <span class="name-part" :class="{ active: i === nameParts.length - 1 }">{{ part }}</span>
      </span>
    </span>
    <TimeDisplay class="row-time" :time="time" />
    <TimerRecordsModal v-if="store.isModal('records', props.id)" :id="props.id" />
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
    margin-right: 0.3ch;
  }
}
.crumb {
  display: inline-flex;
  align-items: center;
  gap: 0.3ch;
}
.separator {
  opacity: 0.35;
}
.name-part {
  opacity: 0.55;

  &.active {
    opacity: 1;
    font-weight: 600;
  }
}
.row-time {
  flex: none;
  font-size: 1.1rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
</style>
