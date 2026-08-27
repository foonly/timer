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

export function getDayStart(time = Date.now(), offset = 4) {
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

export function getDayNumber(offset = 4, time = Date.now()) {
  // A day isn't always exactly 24h across a DST transition, so this ms-based diff drifts by
  // about an hour per transition it spans - fine, Math.round still lands on the right day count
  // as long as that drift stays under 12h (true for any realistic time range here).
  const diff = getDayStart(time, offset) - dayZeroBoundary(offset);
  return Math.round(diff / (1000 * 3600 * 24));
}

export function getTimeFromDays(days: number, offset = 4) {
  // Unlike getDayNumber, this must land on an exact boundary, so it walks calendar days via
  // setDate (DST-safe, preserves the local time-of-day) from day 0's boundary instead of adding
  // days * 24h in ms.
  const date = new Date(dayZeroBoundary(offset));
  date.setDate(date.getDate() + days);
  return date.getTime();
}

export function formatDayLabel(dayNumber: number, todayNumber: number, offset = 4) {
  if (dayNumber === todayNumber) {
    return "Today";
  }
  if (dayNumber === todayNumber - 1) {
    return "Yesterday";
  }
  const date = new Date(getTimeFromDays(dayNumber, offset));
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
