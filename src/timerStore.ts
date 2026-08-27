import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { tagSchema, timerSchema, type fhtTag, type fhtTimer, type timerStatus } from "./types";
import { modalName, getDayNumber, getTimeFromDays, formatDayLabel } from "./helpers";
import { randomTagName } from "./randomNames";

export const useTimerStore = defineStore(
  "timer",
  () => {
    const tags = ref(<fhtTag[]>[]);
    const timers = ref(<fhtTimer[]>[]);
    const modal = ref("");
    const now = ref(Date.now());
    const dayStarts = ref(0);
    // null means "today" and tracks the real day as it advances; a number pins the report to
    // that specific day so browsing history doesn't get yanked forward by a real day rollover.
    const viewedDayNumber = ref<number | null>(null);

    // Getters
    const dayEnds = computed(() => {
      return dayStarts.value + 24 * 3600 * 1000;
    });

    const todayDayNumber = computed(() => getDayNumber(4, now.value));
    const reportDayNumber = computed(() => viewedDayNumber.value ?? todayDayNumber.value);
    const reportDayStart = computed(() => getTimeFromDays(reportDayNumber.value));
    const reportDayEnd = computed(() => reportDayStart.value + 24 * 3600 * 1000);
    const isViewingToday = computed(() => reportDayNumber.value === todayDayNumber.value);
    const reportDayLabel = computed(() =>
      formatDayLabel(reportDayNumber.value, todayDayNumber.value),
    );

    // Actions
    const getTags = (parentTag: string): fhtTag[] => {
      return tags.value.filter((tag) => {
        return tag.parent === parentTag;
      });
    };
    const addTag = (parent: string, name: string, description = "") => {
      const tag = tagSchema.parse({ parent, name, description });
      tags.value.push(tag);
      return tag;
    };
    const removeTag = (remove: string) => {
      tags.value = tags.value.filter((tag) => {
        const id = `${tag.parent}//${tag.name}`;
        return !id.startsWith(remove);
      });
      modal.value = "";
    };
    const goToPreviousDay = () => {
      viewedDayNumber.value = reportDayNumber.value - 1;
    };
    const goToNextDay = () => {
      if (!isViewingToday.value) {
        viewedDayNumber.value = reportDayNumber.value + 1;
      }
    };
    const goToToday = () => {
      viewedDayNumber.value = null;
    };
    const quickStartTag = (parent: string) => {
      const takenNames = new Set(getTags(parent).map((tag) => tag.name));
      let name = randomTagName();
      let attempt = 2;
      while (takenNames.has(name)) {
        name = `${randomTagName()} ${attempt++}`;
      }
      addTag(parent, name);
      startTimer(`${parent}//${name}`);
    };
    const openModal = (id: string, ...name: string[]) => {
      modal.value = modalName(id, ...name);
    };
    const closeModal = () => {
      modal.value = "";
    };
    const isModal = (id: string, ...name: string[]) => {
      return modal.value === modalName(id, ...name);
    };
    const startTimer = (id: string, positive = true) => {
      const timer = timerSchema.parse({
        id,
        positive,
        start: Date.now(),
      });
      timers.value.push(timer);
      now.value = Date.now();
    };
    const stopTimer = (id: string, positive: boolean | undefined = undefined) => {
      for (const timer of timers.value) {
        if (
          timer.id === id &&
          timer.end === 0 &&
          (positive === undefined || timer.positive === positive)
        ) {
          timer.end = Date.now();
        }
      }
    };
    const isRunning = (id: string, positive = true) => {
      for (const timer of timers.value) {
        if (timer.id === id && timer.positive === positive && timer.end === 0) {
          return true;
        }
      }
      return false;
    };
    // A negative (pause) timer covering `id` freezes accrual for `id` itself
    // and everything nested under it, so "paused right now" has to check the
    // whole ancestor chain, not just an exact id match.
    const isPausedNow = (id: string) => {
      return timers.value.some(
        (timer) =>
          !timer.positive && timer.end === 0 && (timer.id === id || id.startsWith(`${timer.id}//`)),
      );
    };
    // Mirrors isPausedNow: `id` can be frozen by a pause on itself or on any
    // ancestor, so resuming has to close every active pause that covers it,
    // not just one started on `id` exactly.
    const resumeTimer = (id: string) => {
      for (const timer of timers.value) {
        if (
          !timer.positive &&
          timer.end === 0 &&
          (timer.id === id || id.startsWith(`${timer.id}//`))
        ) {
          timer.end = Date.now();
        }
      }
    };
    const hasActiveDescendant = (id: string) => {
      return timers.value.some(
        (timer) =>
          timer.positive &&
          timer.end === 0 &&
          timer.id !== id &&
          timer.id.startsWith(`${id}//`) &&
          !isPausedNow(timer.id),
      );
    };
    const getStatus = (id: string): timerStatus => {
      if (isRunning(id)) {
        return isPausedNow(id) ? "paused" : "running";
      }
      if (hasActiveDescendant(id)) {
        return "sub-running";
      }
      return "idle";
    };

    // Core interval-subtraction algorithm, bounded to an arbitrary [rangeStart, rangeEnd) window
    // so it can serve both the live "today" total and a fixed historical day's report.
    const getTimeInRange = (id: string, rangeStart: number, rangeEnd: number) => {
      const cap = Math.min(now.value, rangeEnd);
      const windowTimers = timers.value.filter((t) => t.start >= rangeStart && t.start < rangeEnd);

      const records: Array<{ start: number; end: number; id: string }> = [];
      // Clone the timer records to be able to modify them.
      for (const timer of windowTimers.filter((t) => t.positive && t.id.startsWith(id))) {
        records.push({
          start: timer.start,
          end: timer.end > 0 ? timer.end : cap,
          id: timer.id,
        });
      }

      // Subtract negative timers from the records.
      for (const timer of windowTimers.filter((t) => !t.positive)) {
        const start = timer.start;
        const end = timer.end > 0 ? timer.end : cap;
        for (const r of records) {
          if (r.id.startsWith(timer.id)) {
            if (start >= r.start && start < r.end) {
              // Timer overlaps the start.
              if (end < r.end) {
                // Timer is in the middle, split the record.
                records.push({ start: end, end: r.end, id: r.id });
              }
              r.end = start;
            } else if (end > r.start && end <= r.end) {
              // Timer overlaps the end.
              r.start = end;
            }
          }
        }
      }

      // Add up the remaining records.
      let time = 0;
      let lastEnd = 0;
      for (const r of records.sort((a, b) => a.start - b.start)) {
        if (r.start < lastEnd && r.end > lastEnd) {
          // Records are overlapping.
          time += r.end - lastEnd;
        } else {
          // No overlap.
          time += r.end - r.start;
        }
        lastEnd = r.end;
      }
      return time;
    };

    const getTime = (id: string) => getTimeInRange(id, dayStarts.value, dayEnds.value);

    // One rollup total per tag id that has any timer record on the viewed day, sorted highest
    // first. An empty string id rolls up to every tag, used for the day's grand total.
    const reportEntries = computed(() => {
      const start = reportDayStart.value;
      const end = reportDayEnd.value;
      const ids = new Set(
        timers.value.filter((t) => t.start >= start && t.start < end).map((t) => t.id),
      );
      const entries = [];
      for (const id of ids) {
        const time = getTimeInRange(id, start, end);
        if (time > 0) {
          entries.push({ id, time });
        }
      }
      return entries.sort((a, b) => b.time - a.time);
    });

    const reportDayTotal = computed(() =>
      getTimeInRange("", reportDayStart.value, reportDayEnd.value),
    );

    return {
      tags,
      timers,
      modal,
      now,
      dayStarts,
      dayEnds,
      isViewingToday,
      reportDayLabel,
      reportEntries,
      reportDayTotal,
      goToPreviousDay,
      goToNextDay,
      goToToday,
      getTags,
      addTag,
      removeTag,
      quickStartTag,
      openModal,
      closeModal,
      isModal,
      startTimer,
      stopTimer,
      isRunning,
      resumeTimer,
      getStatus,
      getTime,
    };
  },
  {
    persist: {
      paths: ["tags", "timers"],
    },
  },
);
