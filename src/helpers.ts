import { useTimerStore } from "./timerStore";
import type { timerStatus } from "./types";

export function modalName(id: string, ...name: string[]): string {
  return `${id}:${name.join("//")}`;
}

export const statusLabels: Record<timerStatus, string> = {
  "running": "Running",
  "paused": "Paused",
  "sub-running": "Sub-timer running",
  "idle": "Stopped",
};

export const tagName = (id: string) => {
  return id.split("//").at(-1);
};

// Whether `id` is `ancestor` itself or nested under it. A plain `id.startsWith(ancestor)` would
// wrongly match a sibling whose name happens to start with the same text (e.g. "Child 2" starts
// with "Child" as a string, but isn't nested under it) - the "//" boundary is what rules that out.
export function isSelfOrDescendant(id: string, ancestor: string): boolean {
  return id === ancestor || id.startsWith(`${ancestor}//`);
}

let intervalHandle = 0;

export function startInterval() {
  if (intervalHandle > 0) {
    clearInterval(intervalHandle);
  }
  intervalHandle = setInterval(() => {
    const timerStore = useTimerStore();
    timerStore.now = Date.now();
    if (timerStore.now >= timerStore.dayEnds) {
      timerStore.dayStarts = getDayStart();
    }
  }, 1000);
}

// The hour at which a new "day" begins for reporting purposes, so a late-night session before
// this hour still counts as the previous day. Threaded through as the default `offset` on every
// function below rather than baked into the math, so a caller could still view a different cutoff.
export const DAY_CUTOFF_HOUR = 4;

export const MS_PER_DAY = 24 * 3600 * 1000;

// Whether `timer` has any overlap with `[rangeStart, rangeEnd)` - i.e. whether any of its time
// falls inside that window, even if it started before `rangeStart` or (being still open) will run
// past `rangeEnd`. `now` is passed in (rather than read from the store) so this stays a pure
// function usable from anywhere a timer-like record needs to be tested against a day window.
export function timerOverlapsRange(
  timer: { start: number; end: number },
  rangeStart: number,
  rangeEnd: number,
  now: number,
): boolean {
  const effectiveEnd = timer.end > 0 ? timer.end : now;
  return timer.start < rangeEnd && effectiveEnd > rangeStart;
}

export function getDayStart(time = Date.now(), offset = DAY_CUTOFF_HOUR) {
  const date = new Date(time);
  const sub = date.getHours() < offset;
  date.setHours(offset);
  date.setMinutes(0);
  date.setSeconds(0);
  date.setMilliseconds(0);
  if (sub) {
    date.setDate(date.getDate() - 1);
  }

  return date.getTime();
}

// Day 0's boundary: the getDayStart of a fixed local-time anchor. getDayNumber and
// getTimeFromDays both count from this exact instant so they stay exact inverses of each other.
const dayZeroBoundary = (offset: number) => getDayStart(new Date(2024, 0, 1).getTime(), offset);

export function getDayNumber(offset = DAY_CUTOFF_HOUR, time = Date.now()) {
  // A day isn't always exactly 24h across a DST transition, so this ms-based diff drifts by
  // about an hour per transition it spans - fine, Math.round still lands on the right day count
  // as long as that drift stays under 12h (true for any realistic time range here).
  const diff = getDayStart(time, offset) - dayZeroBoundary(offset);
  return Math.round(diff / MS_PER_DAY);
}

export function getTimeFromDays(days: number, offset = DAY_CUTOFF_HOUR) {
  // Unlike getDayNumber, this must land on an exact boundary, so it walks calendar days via
  // setDate (DST-safe, preserves the local time-of-day) from day 0's boundary instead of adding
  // days * 24h in ms.
  const date = new Date(dayZeroBoundary(offset));
  date.setDate(date.getDate() + days);
  return date.getTime();
}

export function formatDayLabel(dayNumber: number, todayNumber: number, offset = DAY_CUTOFF_HOUR) {
  if (dayNumber === todayNumber) {
    return "Today";
  }
  if (dayNumber === todayNumber - 1) {
    return "Yesterday";
  }
  const date = new Date(getTimeFromDays(dayNumber, offset));
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
