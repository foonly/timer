<script setup lang="ts">
import { useTimerStore } from "../timerStore";
import Chevron from "../assets/chevron-up.svg";
import TimeDisplay from "./TimeDisplay.vue";
import ReportRow from "./ReportRow.vue";

const store = useTimerStore();
</script>

<template>
  <section id="timer-section">
    <div class="report-nav">
      <Chevron
        class="icon clickable nav-prev"
        title="Previous day"
        @click="store.goToPreviousDay()"
      />
      <button
        class="day-label"
        :class="{ clickable: !store.isViewingToday }"
        :disabled="store.isViewingToday"
        @click="store.goToToday()"
      >
        {{ store.reportDayLabel }}
      </button>
      <Chevron
        class="icon nav-next"
        :class="{ clickable: !store.isViewingToday, disabled: store.isViewingToday }"
        title="Next day"
        @click="store.goToNextDay()"
      />
    </div>
    <div class="report-total">
      <span>Total tracked</span>
      <TimeDisplay :time="store.reportDayTotal" />
    </div>
    <div class="report-list" v-if="store.reportEntries.length">
      <ReportRow
        v-for="entry in store.reportEntries"
        :key="entry.id"
        :id="entry.id"
        :time="entry.time"
        :live="store.isViewingToday"
      />
    </div>
    <p class="empty" v-else>No time tracked on this day.</p>
  </section>
</template>

<style scoped>
.report-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
}
.nav-prev {
  transform: rotate(-90deg);
}
.nav-next {
  transform: rotate(90deg);
}
.disabled {
  opacity: 0.15;
  cursor: default;
}
.day-label {
  background: none;
  font-size: 1.1rem;
  font-weight: bold;
  min-width: 9rem;
  text-align: center;

  &:disabled {
    cursor: default;
  }
}
.report-total {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 0.6rem;
  margin: 0.75rem 0 1rem;
  font-size: 1.6rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;

  & span {
    font-size: 0.9rem;
    font-weight: normal;
    opacity: 0.7;
  }
}
.empty {
  opacity: 0.6;
  text-align: center;
  margin-top: 2rem;
}
</style>
