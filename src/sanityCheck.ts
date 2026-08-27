import type { fhtTimer } from "./types";

// A timer is redundant if another timer of the same id and direction (positive/negative)
// fully covers its interval, so removing it wouldn't change any getTime() result. This is
// distinct from the normal, expected case of alternating positive/negative timers on a tag
// (e.g. run, pause, run again) - only same-direction duplicates count.
export function findRedundantTimers(timers: fhtTimer[]): fhtTimer[] {
  const effectiveEnd = (timer: fhtTimer) => (timer.end > 0 ? timer.end : Infinity);

  return timers.filter((a, i) =>
    timers.some((b, j) => {
      if (j === i || b.id !== a.id || b.positive !== a.positive) {
        return false;
      }
      const covers = b.start <= a.start && effectiveEnd(a) <= effectiveEnd(b);
      if (!covers) {
        return false;
      }
      const identical = b.start === a.start && effectiveEnd(a) === effectiveEnd(b);
      // For an exact duplicate, only flag the later one so one copy always survives.
      return identical ? j < i : true;
    }),
  );
}
