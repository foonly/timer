<script setup lang="ts">
import { useTimerStore } from "../timerStore";
import Chevron from "../assets/chevron-up.svg";
import TimeDisplay from "./TimeDisplay.vue";
import ReportRow from "./ReportRow.vue";
import IconButton from "./IconButton.vue";

const store = useTimerStore();
</script>

<template>
  <section id="timer-section">
    <div class="report-nav">
      <IconButton label="Previous day" @click="store.goToPreviousDay()">
        <Chevron class="icon nav-prev" />
      </IconButton>
      <button class="day-label" :disabled="store.isViewingToday" @click="store.goToToday()">
        {{ store.reportDayLabel }}
      </button>
      <IconButton label="Next day" :disabled="store.isViewingToday" @click="store.goToNextDay()">
        <Chevron class="icon nav-next" />
      </IconButton>
    </div>
    <div class="report-total">
      <span>Time active</span>
      <TimeDisplay :time="store.reportDayActiveTime" />
    </div>
    <div class="report-total report-total-secondary">
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
.day-label {
  background: none;
  border: none;
  font-size: 1.1rem;
  font-weight: bold;
  min-width: 9rem;
  text-align: center;
  opacity: 0.75;
  transition: opacity 0.15s ease;

  &:hover:not(:disabled) {
    opacity: 1;
  }

  &:disabled {
    opacity: 1;
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

  @media screen and (max-width: 480px) {
    font-size: 1.3rem;
  }
}
.report-total-secondary {
  margin: -0.75rem 0 1rem;
  font-size: 1rem;
  font-weight: normal;
  opacity: 0.7;

  & span {
    font-size: 0.85rem;
  }
}
.empty {
  opacity: 0.6;
  text-align: center;
  margin-top: 2rem;
}
</style>
