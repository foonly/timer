import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { tagSchema, timerSchema, type fhtTag, type fhtTimer, type timerStatus } from "./types";
import {
  modalName,
  getDayNumber,
  getTimeFromDays,
  formatDayLabel,
  isSelfOrDescendant,
} from "./helpers";
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
      // Once the tag is gone there's no card left to click Stop/Resume on, so any timer still
      // open on it or a descendant would otherwise run (or stay paused) forever, uncontrollably.
      const stoppedAt = Date.now();
      for (const timer of timers.value) {
        if (timer.end === 0 && isSelfOrDescendant(timer.id, remove)) {
          timer.end = stoppedAt;
        }
      }
      tags.value = tags.value.filter((tag) => {
        const id = `${tag.parent}//${tag.name}`;
        return !isSelfOrDescendant(id, remove);
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
        (timer) => !timer.positive && timer.end === 0 && isSelfOrDescendant(id, timer.id),
      );
    };
    // Mirrors isPausedNow: `id` can be frozen by a pause on itself or on any
    // ancestor, so resuming has to close every active pause that covers it,
    // not just one started on `id` exactly.
    const resumeTimer = (id: string) => {
      for (const timer of timers.value) {
        if (!timer.positive && timer.end === 0 && isSelfOrDescendant(id, timer.id)) {
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
          isSelfOrDescendant(timer.id, id) &&
          !isPausedNow(timer.id),
      );
    };
    // Like hasActiveDescendant, but also counts a descendant that's currently frozen by a pause -
    // used to tell "genuinely nothing running below" apart from "paused before it could show as
    // running", so a tag with only sub-timers still reports "paused" instead of "idle" once its
    // whole subtree is frozen.
    const hasOpenDescendant = (id: string) => {
      return timers.value.some(
        (timer) =>
          timer.positive && timer.end === 0 && timer.id !== id && isSelfOrDescendant(timer.id, id),
      );
    };
    const getStatus = (id: string): timerStatus => {
      if (isRunning(id)) {
        return isPausedNow(id) ? "paused" : "running";
      }
      if (hasActiveDescendant(id)) {
        return "sub-running";
      }
      if (isPausedNow(id) && hasOpenDescendant(id)) {
        return "paused";
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
      for (const timer of windowTimers.filter((t) => t.positive && isSelfOrDescendant(t.id, id))) {
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
          if (isSelfOrDescendant(r.id, timer.id)) {
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

    // One rollup total per tag id that has any time on the viewed day, in depth-first tree order
    // (a parent immediately followed by its children) so a tag with only sub-timers running
    // still shows up, ahead of the children that actually account for its time.
    const reportEntries = computed(() => {
      const start = reportDayStart.value;
      const end = reportDayEnd.value;
      const entries: Array<{ id: string; time: number }> = [];

      const visit = (parent: string) => {
        for (const tag of getTags(parent)) {
          const id = `${tag.parent}//${tag.name}`;
          const time = getTimeInRange(id, start, end);
          if (time > 0) {
            entries.push({ id, time });
          }
          visit(id);
        }
      };
      visit("");

      // A timer whose tag has since been deleted has no matching tag entry any more, so the walk
      // above never produces a row for it - even when a surviving ancestor's own row already
      // rolls its time in. Keeping its own row too (same as any other parent+child pair) is what
      // lets a tag be deleted to tidy up the tag list without losing its history from the report.
      // A rename doesn't hit this path: it updates the timer's id in place, so it's still "known".
      const knownTagIds = new Set(tags.value.map((tag) => `${tag.parent}//${tag.name}`));
      const deletedTagIds = new Set(
        timers.value
          .filter((t) => t.start >= start && t.start < end)
          .map((t) => t.id)
          .filter((id) => !knownTagIds.has(id)),
      );
      for (const id of [...deletedTagIds].sort()) {
        const time = getTimeInRange(id, start, end);
        if (time > 0) {
          entries.push({ id, time });
        }
      }

      return entries;
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
