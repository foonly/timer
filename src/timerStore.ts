import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { tagSchema, timerSchema, type fhtTag, type fhtTimer, type timerStatus } from "./types";
import {
  modalName,
  getDayNumber,
  getTimeFromDays,
  formatDayLabel,
  isSelfOrDescendant,
  timerOverlapsRange,
  DAY_CUTOFF_HOUR,
  MS_PER_DAY,
} from "./helpers";
import { randomTagName } from "./randomNames";
import { now, dayStarts } from "./clock";

export const useTimerStore = defineStore(
  "timer",
  () => {
    const tags = ref(<fhtTag[]>[]);
    const timers = ref(<fhtTimer[]>[]);
    const modal = ref("");
    // null means "today" and tracks the real day as it advances; a number pins the report to
    // that specific day so browsing history doesn't get yanked forward by a real day rollover.
    const viewedDayNumber = ref<number | null>(null);

    // Getters
    const dayEnds = computed(() => {
      return dayStarts.value + MS_PER_DAY;
    });

    const todayDayNumber = computed(() => getDayNumber(DAY_CUTOFF_HOUR, now.value));
    const reportDayNumber = computed(() => viewedDayNumber.value ?? todayDayNumber.value);
    const reportDayStart = computed(() => getTimeFromDays(reportDayNumber.value));
    const reportDayEnd = computed(() => reportDayStart.value + MS_PER_DAY);
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

    // Core interval-subtraction step, bounded to an arbitrary [rangeStart, rangeEnd) window so it
    // can serve both the live "today" total and a fixed historical day's report. Returns the
    // still-open-ended list of positive records for `id` and its descendants, each clipped to the
    // window and with any overlapping negative (pause) timer already carved out - callers decide
    // separately whether to sum these raw (double-counting concurrent records) or merge them into
    // a deduped union.
    //
    // Filtering (and clipping) by overlap rather than by `t.start` alone matters for a timer that
    // was already running when rangeStart hit (e.g. one still open from before the 04:00 day
    // cutoff): it must contribute its portion inside this window even though it started earlier,
    // and correspondingly must NOT contribute the portion outside this window - otherwise that
    // time either vanishes (excluded from every day) or gets double-counted (attributed both to
    // the day it started on and the day it's viewed from).
    const getRecordsInRange = (id: string, rangeStart: number, rangeEnd: number) => {
      const clipToRange = (t: { start: number; end: number }) => ({
        start: Math.max(t.start, rangeStart),
        end: Math.min(t.end > 0 ? t.end : now.value, rangeEnd),
      });

      const windowTimers = timers.value.filter((t) =>
        timerOverlapsRange(t, rangeStart, rangeEnd, now.value),
      );

      const records: Array<{ start: number; end: number; id: string }> = [];
      // Clone the timer records to be able to modify them.
      for (const timer of windowTimers.filter((t) => t.positive && isSelfOrDescendant(t.id, id))) {
        records.push({ ...clipToRange(timer), id: timer.id });
      }

      // Subtract negative timers from the records.
      for (const timer of windowTimers.filter((t) => !t.positive)) {
        const { start, end } = clipToRange(timer);
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

      return records;
    };

    // Sum of each record's own duration, so two timers tracked concurrently (e.g. on unrelated
    // tags) each contribute their full length even though they cover the same wall-clock time.
    const getRawTimeInRange = (id: string, rangeStart: number, rangeEnd: number) => {
      return getRecordsInRange(id, rangeStart, rangeEnd).reduce(
        (sum, r) => sum + (r.end - r.start),
        0,
      );
    };

    // Union of the records' time ranges, so concurrent/overlapping records (e.g. a broad tag and a
    // nested sub-tag both tracked at once) count that wall-clock time only once. `coveredUntil`
    // tracks the furthest point the union has reached so far - a record that ends before that point
    // is already fully covered and contributes nothing, and one that extends past it only
    // contributes the new, not-yet-covered portion.
    const getTimeInRange = (id: string, rangeStart: number, rangeEnd: number) => {
      let time = 0;
      let coveredUntil = 0;
      for (const r of getRecordsInRange(id, rangeStart, rangeEnd).sort(
        (a, b) => a.start - b.start,
      )) {
        if (r.end <= coveredUntil) {
          continue;
        }
        time += r.end - Math.max(r.start, coveredUntil);
        coveredUntil = r.end;
      }
      return time;
    };

    const getTime = (id: string) => getTimeInRange(id, dayStarts.value, dayEnds.value);

    // One rollup total per tag id that has any time on the viewed day, in depth-first tree order
    // (a parent immediately followed by its children, siblings by when their subtree's activity
    // first started that day) so a tag with only sub-timers running still shows up, ahead of the
    // children that actually account for its time.
    //
    // A timer whose tag has since been deleted has no matching tag entry any more, so it can't be
    // found via getTags - it's treated as a "virtual" node instead, recursed into as its own
    // parent id (sliced from its id, same as how it was built) and sorted into its live siblings
    // by the same key, so deleting a tag to tidy up the tag list keeps that tag's place in the
    // report rather than bumping it to the very end. A rename doesn't hit this path: it updates
    // the timer's id in place, so it's still "known". Deleting a tag also deletes its whole
    // subtree at once, so a deleted id only ever has further deleted descendants, never live ones.
    const reportEntries = computed(() => {
      const start = reportDayStart.value;
      const end = reportDayEnd.value;
      const entries: Array<{ id: string; time: number }> = [];

      const knownTagIds = new Set(tags.value.map((tag) => `${tag.parent}//${tag.name}`));
      const parentOf = (id: string) => id.slice(0, id.lastIndexOf("//"));

      // A deleted id whose own tag never had a direct timer (only a deleted descendant did, e.g.
      // a tag that only ever showed sub-timer activity) has no timer record of its own to spot it
      // by - so also synthesize every such intermediate ancestor, up to the first id that's still
      // a known tag (or the root), so the walk below can still reach that descendant at all.
      const deletedLeafIds = new Set(
        timers.value
          .filter((t) => timerOverlapsRange(t, start, end, now.value))
          .map((t) => t.id)
          .filter((id) => !knownTagIds.has(id)),
      );
      const deletedIds = new Set(deletedLeafIds);
      for (const id of deletedLeafIds) {
        let ancestor = parentOf(id);
        while (ancestor !== "" && !knownTagIds.has(ancestor) && !deletedIds.has(ancestor)) {
          deletedIds.add(ancestor);
          ancestor = parentOf(ancestor);
        }
      }
      const earliestActivity = (id: string) => {
        const starts = timers.value
          .filter(
            (t) => timerOverlapsRange(t, start, end, now.value) && isSelfOrDescendant(t.id, id),
          )
          .map((t) => t.start);
        return starts.length ? Math.min(...starts) : Infinity;
      };

      const visit = (parent: string) => {
        const liveIds = getTags(parent).map((tag) => `${tag.parent}//${tag.name}`);
        const deletedChildIds = [...deletedIds].filter((id) => parentOf(id) === parent);
        const children = [...liveIds, ...deletedChildIds].sort(
          (a, b) => earliestActivity(a) - earliestActivity(b),
        );
        for (const id of children) {
          const time = getTimeInRange(id, start, end);
          if (time > 0) {
            entries.push({ id, time });
          }
          visit(id);
        }
      };
      visit("");

      return entries;
    });

    // "Total tracked": every tracked timer counts its full length, even if two ran concurrently
    // (e.g. on unrelated tags) - a measure of total logged effort, not wall-clock time.
    const reportDayTotal = computed(() =>
      getRawTimeInRange("", reportDayStart.value, reportDayEnd.value),
    );

    // "Time active": the wall-clock time during which at least one timer was running that day -
    // concurrent/overlapping timers are merged so that time isn't counted twice.
    const reportDayActiveTime = computed(() =>
      getTimeInRange("", reportDayStart.value, reportDayEnd.value),
    );

    return {
      tags,
      timers,
      modal,
      dayEnds,
      isViewingToday,
      reportDayLabel,
      reportEntries,
      reportDayTotal,
      reportDayActiveTime,
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
