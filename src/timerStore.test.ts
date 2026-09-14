import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useTimerStore } from "./timerStore";
import { now, dayStarts } from "./clock";
import {
  DAY_CUTOFF_HOUR,
  MS_PER_DAY,
  OLD_DAY_CACHE_THRESHOLD_DAYS,
  getDayNumber,
  getDayStart,
  getTimeFromDays,
} from "./helpers";
import { getCached, invalidateAll } from "./dayTagAggregateCache";
import type { fhtTimer } from "./types";

// A fixed instant (rather than the real wall clock) so every "N days ago" fixture below lands on
// an exact, reproducible day boundary. Both Date.now() (via vi.setSystemTime, since several store
// actions - addTag, updateTag, removeTag, ...  - read it directly) and clock.ts's `now`/`dayStarts`
// refs are pinned to it, so the two stay consistent with each other exactly as they would at
// runtime.
const FIXED_NOW = new Date(2026, 5, 15, 12, 0, 0, 0).getTime();

const pathOf = (tag: { parent: string; name: string }) => `${tag.parent}//${tag.name}`;
const todayDayNum = () => getDayNumber(DAY_CUTOFF_HOUR, now.value);

let uuidCounter = 0;
function makeTimer(overrides: Partial<fhtTimer> & { id: string; start: number }): fhtTimer {
  uuidCounter += 1;
  return {
    uuid: `test-uuid-${uuidCounter}`,
    description: "",
    positive: true,
    end: 0,
    updatedAt: overrides.start,
    ...overrides,
  };
}

// Steps store.viewedDayNumber back to exactly `targetDayNumber` via the same goToPreviousDay
// action a real user would use, rather than poking viewedDayNumber directly.
function goToDay(store: ReturnType<typeof useTimerStore>, targetDayNumber: number) {
  store.goToToday();
  const steps = todayDayNum() - targetDayNumber;
  for (let i = 0; i < steps; i++) {
    store.goToPreviousDay();
  }
}

// reportDayTotal/reportDayActiveTime only ever populate the cache for the root ("") id -
// per-tag entries are only populated as reportEntries visits each tag in the tree, exactly as
// DailyReport.vue's real render does. Reads reportEntries (as a real view of the day would) and
// returns the visited time for `id`, so tests exercise the same path a user's screen does.
function entryTime(store: ReturnType<typeof useTimerStore>, id: string): number | undefined {
  return store.reportEntries.find((e) => e.id === id)?.time;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setActivePinia(createPinia());
  now.value = FIXED_NOW;
  dayStarts.value = getDayStart(FIXED_NOW);
  invalidateAll();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("day-tag aggregate cache", () => {
  it("caches an eligible old day's aggregate and serves later reads from the cache", () => {
    const store = useTimerStore();
    const workTag = store.addTag("", "Work");
    const workId = pathOf(workTag);
    const oldDayNum = todayDayNum() - 40;
    const oldDayStart = getTimeFromDays(oldDayNum);

    store.timers.push(
      makeTimer({ id: workId, start: oldDayStart + 3_600_000, end: oldDayStart + 3 * 3_600_000 }),
    );

    goToDay(store, oldDayNum);

    expect(store.reportDayActiveTime).toBe(2 * 3_600_000);
    expect(entryTime(store, workId)).toBe(2 * 3_600_000);
    expect(getCached(oldDayNum, workId)).toEqual({
      netTime: 2 * 3_600_000,
      rawTime: 2 * 3_600_000,
      volatile: false,
    });
    expect(getCached(oldDayNum, "")).toBeDefined();

    // Corrupt the underlying record directly, bypassing every invalidation-aware mutation action -
    // if the next read still returns the old value, that proves it came from the cache rather than
    // a fresh scan. This is exactly the staleness the dev-mode cross-check in getDayAggregate
    // exists to catch for a *real* bug, so it correctly (and, here, expectedly) flags a mismatch -
    // silence it rather than let this deliberately-contrived case spam the test output.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    store.timers[0].end = oldDayStart + 5 * 3_600_000;
    expect(store.reportDayActiveTime).toBe(2 * 3_600_000);
    expect(entryTime(store, workId)).toBe(2 * 3_600_000);
    consoleError.mockRestore();
  });

  it("does not cache a day inside the active (non-eligible) window", () => {
    const store = useTimerStore();
    const workTag = store.addTag("", "Work");
    const workId = pathOf(workTag);
    const recentDayNum = todayDayNum() - 5;
    const recentDayStart = getTimeFromDays(recentDayNum);

    store.timers.push(
      makeTimer({
        id: workId,
        start: recentDayStart + 3_600_000,
        end: recentDayStart + 2 * 3_600_000,
      }),
    );

    goToDay(store, recentDayNum);

    expect(store.reportDayActiveTime).toBe(3_600_000);
    expect(getCached(recentDayNum, workId)).toBeUndefined();
  });

  it("treats exactly the threshold as eligible and one day newer as not", () => {
    const store = useTimerStore();
    const workTag = store.addTag("", "Work");
    const workId = pathOf(workTag);
    const boundaryDayNum = todayDayNum() - OLD_DAY_CACHE_THRESHOLD_DAYS;
    const insideDayNum = boundaryDayNum + 1;

    for (const dayNum of [boundaryDayNum, insideDayNum]) {
      const dayStart = getTimeFromDays(dayNum);
      store.timers.push(
        makeTimer({ id: workId, start: dayStart + 3_600_000, end: dayStart + 2 * 3_600_000 }),
      );
    }

    goToDay(store, boundaryDayNum);
    expect(entryTime(store, workId)).toBe(3_600_000);
    expect(getCached(boundaryDayNum, workId)).toBeDefined();

    goToDay(store, insideDayNum);
    expect(entryTime(store, workId)).toBe(3_600_000);
    expect(getCached(insideDayNum, workId)).toBeUndefined();
  });

  it("never caches a day while a contributing timer is still open", () => {
    const store = useTimerStore();
    const workTag = store.addTag("", "Work");
    const workId = pathOf(workTag);
    const oldDayNum = todayDayNum() - 40;
    const oldDayStart = getTimeFromDays(oldDayNum);

    store.timers.push(makeTimer({ id: workId, start: oldDayStart + 3_600_000, end: 0 }));

    goToDay(store, oldDayNum);

    expect(store.reportDayActiveTime).toBe(MS_PER_DAY - 3_600_000);
    expect(entryTime(store, workId)).toBe(MS_PER_DAY - 3_600_000);
    expect(getCached(oldDayNum, workId)).toBeUndefined();
    expect(getCached(oldDayNum, "")).toBeUndefined();
  });

  it("updateTimer invalidates the old cached day it touches, before and after the edit", () => {
    const store = useTimerStore();
    const workTag = store.addTag("", "Work");
    const workId = pathOf(workTag);
    const oldDayNum = todayDayNum() - 40;
    const oldDayStart = getTimeFromDays(oldDayNum);
    const timer = makeTimer({
      id: workId,
      start: oldDayStart + 3_600_000,
      end: oldDayStart + 2 * 3_600_000,
    });
    store.timers.push(timer);

    goToDay(store, oldDayNum);
    expect(entryTime(store, workId)).toBe(3_600_000);
    expect(getCached(oldDayNum, workId)).toBeDefined();

    store.updateTimer(timer.uuid, {
      start: oldDayStart + 3_600_000,
      end: oldDayStart + 4 * 3_600_000,
      description: "",
      positive: true,
    });

    expect(getCached(oldDayNum, workId)).toBeUndefined();
    expect(entryTime(store, workId)).toBe(3 * 3_600_000);
    expect(getCached(oldDayNum, workId)).toEqual({
      netTime: 3 * 3_600_000,
      rawTime: 3 * 3_600_000,
      volatile: false,
    });
  });

  it("removeTimer invalidates its old cached day", () => {
    const store = useTimerStore();
    const workTag = store.addTag("", "Work");
    const workId = pathOf(workTag);
    const oldDayNum = todayDayNum() - 40;
    const oldDayStart = getTimeFromDays(oldDayNum);
    const timer = makeTimer({
      id: workId,
      start: oldDayStart + 3_600_000,
      end: oldDayStart + 2 * 3_600_000,
    });
    store.timers.push(timer);

    goToDay(store, oldDayNum);
    expect(entryTime(store, workId)).toBe(3_600_000);
    expect(getCached(oldDayNum, workId)).toBeDefined();

    store.removeTimer(timer.uuid);

    expect(getCached(oldDayNum, workId)).toBeUndefined();
    expect(store.reportDayActiveTime).toBe(0);
    expect(entryTime(store, workId)).toBeUndefined();
  });

  it("applyRemoteEvent invalidates an old cached day as a remote record is added then closed", () => {
    const store = useTimerStore();
    const workTag = store.addTag("", "Work");
    const workId = pathOf(workTag);
    const oldDayNum = todayDayNum() - 40;
    const oldDayStart = getTimeFromDays(oldDayNum);

    store.timers.push(
      makeTimer({ id: workId, start: oldDayStart + 3_600_000, end: oldDayStart + 2 * 3_600_000 }),
    );
    goToDay(store, oldDayNum);
    expect(entryTime(store, workId)).toBe(3_600_000);
    expect(getCached(oldDayNum, workId)).toBeDefined();

    const remoteUuid = "remote-uuid-1";
    store.applyRemoteEvent({
      id: "evt-1",
      deviceId: "device-2",
      timestamp: oldDayStart + 5 * 3_600_000,
      type: "timer_started",
      entityId: remoteUuid,
      payload: {
        uuid: remoteUuid,
        tagUuid: workTag.uuid,
        positive: true,
        start: oldDayStart + 5 * 3_600_000,
      },
    });

    // A new, still-open contributing record must bust the already-cached total for that day.
    expect(getCached(oldDayNum, workId)).toBeUndefined();

    store.applyRemoteEvent({
      id: "evt-2",
      deviceId: "device-2",
      timestamp: oldDayStart + 6 * 3_600_000,
      type: "timer_stopped",
      entityId: remoteUuid,
      payload: { uuid: remoteUuid, end: oldDayStart + 6 * 3_600_000 },
    });

    expect(entryTime(store, workId)).toBe(2 * 3_600_000);
    expect(getCached(oldDayNum, workId)).toEqual({
      netTime: 2 * 3_600_000,
      rawTime: 2 * 3_600_000,
      volatile: false,
    });
  });

  it("renaming a tag clears the cache and re-caches under the new id", () => {
    const store = useTimerStore();
    const workTag = store.addTag("", "Work");
    const workId = pathOf(workTag);
    const oldDayNum = todayDayNum() - 40;
    const oldDayStart = getTimeFromDays(oldDayNum);
    store.timers.push(
      makeTimer({ id: workId, start: oldDayStart + 3_600_000, end: oldDayStart + 2 * 3_600_000 }),
    );

    goToDay(store, oldDayNum);
    expect(entryTime(store, workId)).toBe(3_600_000);
    expect(getCached(oldDayNum, workId)).toBeDefined();

    store.updateTag(workId, {
      name: "Renamed",
      parent: workTag.parent,
      description: "",
      order: workTag.order,
    });
    const renamedId = `${workTag.parent}//Renamed`;

    expect(getCached(oldDayNum, workId)).toBeUndefined();
    expect(store.timers[0].id).toBe(renamedId);

    expect(entryTime(store, renamedId)).toBe(3_600_000);
    expect(getCached(oldDayNum, renamedId)).toBeDefined();
  });

  it("removing a tag force-closes a still-open old timer, which then aggregates and caches correctly", () => {
    const store = useTimerStore();
    const workTag = store.addTag("", "Work");
    const workId = pathOf(workTag);
    const oldDayNum = todayDayNum() - 40;
    const oldDayStart = getTimeFromDays(oldDayNum);
    store.timers.push(makeTimer({ id: workId, start: oldDayStart + 3_600_000, end: 0 }));

    goToDay(store, oldDayNum);
    expect(getCached(oldDayNum, workId)).toBeUndefined(); // still open - never cached

    store.removeTag(workId);

    expect(store.timers[0].end).toBe(FIXED_NOW);
    expect(store.tags.find((t) => t.uuid === workTag.uuid)).toBeUndefined();

    const workEntry = store.reportEntries.find((e) => e.id === workId);
    expect(workEntry?.time).toBe(MS_PER_DAY - 3_600_000);
    expect(getCached(oldDayNum, workId)).toEqual({
      netTime: MS_PER_DAY - 3_600_000,
      rawTime: MS_PER_DAY - 3_600_000,
      volatile: false,
    });
  });

  it("never caches today's total", () => {
    const store = useTimerStore();
    const workTag = store.addTag("", "Work");
    const workId = pathOf(workTag);
    store.timers.push(
      makeTimer({
        id: workId,
        start: dayStarts.value + 3_600_000,
        end: dayStarts.value + 2 * 3_600_000,
      }),
    );

    expect(store.reportDayActiveTime).toBe(3_600_000);
    expect(getCached(todayDayNum(), workId)).toBeUndefined();
  });

  it("getTime reflects today's total regardless of unrelated old history", () => {
    const store = useTimerStore();
    const workTag = store.addTag("", "Work");
    const workId = pathOf(workTag);
    store.timers.push(
      makeTimer({
        id: workId,
        start: dayStarts.value + 3_600_000,
        end: dayStarts.value + 2 * 3_600_000,
      }),
    );
    const oldDayStart = getTimeFromDays(todayDayNum() - 40);
    store.timers.push(makeTimer({ id: workId, start: oldDayStart, end: oldDayStart + 3_600_000 }));

    expect(store.getTime(workId)).toBe(3_600_000);
  });
});
