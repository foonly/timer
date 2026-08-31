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
import { useSyncStore } from "./syncStore";
import type { SyncEvent } from "./sync/events";

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

    const pathOf = (tag: { parent: string; name: string }) => `${tag.parent}//${tag.name}`;

    // Resolves a tag's own path into its uuid, for building sync-event payloads. `""` (root) has
    // no owning tag, so it maps to `null` rather than being looked up.
    const resolveTagUuid = (path: string): string | null => {
      if (path === "") {
        return null;
      }
      return tags.value.find((t) => pathOf(t) === path)?.uuid ?? null;
    };

    const findTagPathByUuid = (uuid: string): string | undefined => {
      const tag = tags.value.find((t) => t.uuid === uuid);
      return tag ? pathOf(tag) : undefined;
    };

    // Shared by addTag (local) and applyRemoteEvent's tag_added handling: idempotent on uuid, so
    // replaying an already-known tag_added (e.g. re-seeing your own event on the next pull) is a
    // harmless no-op.
    const insertTag = (
      uuid: string,
      parent: string,
      name: string,
      description: string,
      updatedAt: number,
    ) => {
      const existing = tags.value.find((t) => t.uuid === uuid);
      if (existing) {
        return existing;
      }
      const tag = tagSchema.parse({ uuid, parent, name, description, updatedAt });
      tags.value.push(tag);
      return tag;
    };

    // Shared by updateTag (local) and applyRemoteEvent's tag_updated handling. Mutates `tag` in
    // place (preserving its uuid/object identity) and, on an actual rename/reparent, cascades the
    // path-string rewrite across every descendant tag and timer - mirroring the existing
    // timer-id cascade below, which already correctly walks the whole subtree via
    // isSelfOrDescendant rather than just direct children.
    const renameTagInPlace = (
      tag: fhtTag,
      fields: { name: string; parent: string; description: string },
      timestamp: number,
    ) => {
      const id = pathOf(tag);
      const newId = `${fields.parent}//${fields.name}`;
      tag.name = fields.name;
      tag.description = fields.description;
      tag.parent = fields.parent;
      tag.updatedAt = timestamp;

      if (newId === id) {
        return;
      }
      for (const other of tags.value) {
        if (other.uuid === tag.uuid) {
          continue;
        }
        if (isSelfOrDescendant(other.parent, id)) {
          other.parent = other.parent === id ? newId : newId + other.parent.slice(id.length);
        }
      }
      for (const timer of timers.value) {
        if (timer.id === id) {
          timer.id = newId;
        } else if (isSelfOrDescendant(timer.id, id)) {
          timer.id = newId + timer.id.slice(id.length);
        }
      }
    };

    // Shared by removeTag (local) and applyRemoteEvent's tag_removed handling - the actual
    // subtree-stop-then-filter mutation, without the local-only modal/event-emission side effects.
    const removeTagInternal = (remove: string, stoppedAt: number) => {
      // Once the tag is gone there's no card left to click Stop/Resume on, so any timer still
      // open on it or a descendant would otherwise run (or stay paused) forever, uncontrollably.
      for (const timer of timers.value) {
        if (timer.end === 0 && isSelfOrDescendant(timer.id, remove)) {
          timer.end = stoppedAt;
        }
      }
      tags.value = tags.value.filter((tag) => !isSelfOrDescendant(pathOf(tag), remove));
    };

    const addTag = (parent: string, name: string, description = "") => {
      const uuid = crypto.randomUUID();
      const updatedAt = Date.now();
      const tag = insertTag(uuid, parent, name, description, updatedAt);
      useSyncStore().enqueueEvent({
        id: crypto.randomUUID(),
        type: "tag_added",
        entityId: uuid,
        deviceId: useSyncStore().deviceId,
        timestamp: updatedAt,
        payload: { uuid, parentUuid: resolveTagUuid(parent), name, description },
      });
      return tag;
    };

    const updateTag = (
      id: string,
      fields: { name: string; parent: string; description: string },
    ) => {
      const tag = tags.value.find((t) => pathOf(t) === id);
      if (!tag) {
        return;
      }
      const timestamp = Date.now();
      renameTagInPlace(tag, fields, timestamp);
      useSyncStore().enqueueEvent({
        id: crypto.randomUUID(),
        type: "tag_updated",
        entityId: tag.uuid,
        deviceId: useSyncStore().deviceId,
        timestamp,
        payload: {
          uuid: tag.uuid,
          parentUuid: resolveTagUuid(fields.parent),
          name: fields.name,
          description: fields.description,
        },
      });
    };

    const removeTag = (remove: string) => {
      const removedTag = tags.value.find((t) => pathOf(t) === remove);
      const stoppedAt = Date.now();
      removeTagInternal(remove, stoppedAt);
      modal.value = "";
      if (removedTag) {
        useSyncStore().enqueueEvent({
          id: crypto.randomUUID(),
          type: "tag_removed",
          entityId: removedTag.uuid,
          deviceId: useSyncStore().deviceId,
          timestamp: stoppedAt,
          payload: { uuid: removedTag.uuid },
        });
      }
    };

    // Backfills `uuid`/`updatedAt` on any tag/timer that predates the sync feature - persisted
    // state is written straight into these refs on load, bypassing tagSchema/timerSchema's zod
    // defaults, so this has to run explicitly once at startup (see main.ts) before anything else
    // touches tags/timers.
    const migrateUuids = () => {
      for (const tag of tags.value) {
        if (!tag.uuid) {
          tag.uuid = crypto.randomUUID();
        }
        if (!tag.updatedAt) {
          tag.updatedAt = Date.now();
        }
      }
      for (const timer of timers.value) {
        if (!timer.uuid) {
          timer.uuid = crypto.randomUUID();
        }
        if (!timer.updatedAt) {
          timer.updatedAt = timer.end || timer.start;
        }
      }
    };

    // Applies an event pulled from another device onto local state, by calling straight into the
    // same tags/timers arrays the local actions above use - so there is exactly one place per
    // mutation "shape" (insertTag/renameTagInPlace/removeTagInternal), just two entry points
    // (local action vs. here) into it. Deliberately never touches the sync store's pendingEvents:
    // that's what makes an infinite local<->remote echo structurally impossible, rather than
    // something that has to be remembered as a per-call flag.
    const applyRemoteEvent = (event: SyncEvent) => {
      switch (event.type) {
        case "tag_added": {
          const parent = event.payload.parentUuid
            ? (findTagPathByUuid(event.payload.parentUuid) ?? "")
            : "";
          insertTag(
            event.payload.uuid,
            parent,
            event.payload.name,
            event.payload.description,
            event.timestamp,
          );
          return;
        }
        case "tag_updated": {
          const parent = event.payload.parentUuid
            ? (findTagPathByUuid(event.payload.parentUuid) ?? "")
            : "";
          const tag = tags.value.find((t) => t.uuid === event.payload.uuid);
          if (!tag) {
            // Its tag_added hasn't been applied yet (events can arrive out of order) - treat this
            // as the creation, the freshest fields we have for it either way.
            insertTag(
              event.payload.uuid,
              parent,
              event.payload.name,
              event.payload.description,
              event.timestamp,
            );
            return;
          }
          if (event.timestamp <= tag.updatedAt) {
            return; // a newer local edit wins (last-write-wins)
          }
          renameTagInPlace(
            tag,
            { name: event.payload.name, parent, description: event.payload.description },
            event.timestamp,
          );
          return;
        }
        case "tag_removed": {
          const path = findTagPathByUuid(event.payload.uuid);
          if (path) {
            removeTagInternal(path, event.timestamp);
          }
          return;
        }
        case "timer_started": {
          if (timers.value.some((t) => t.uuid === event.payload.uuid)) {
            return;
          }
          const path = findTagPathByUuid(event.payload.tagUuid);
          if (!path) {
            console.warn(`Sync: unknown tag for timer ${event.payload.uuid} - skipping`);
            return;
          }
          const timer = timerSchema.parse({
            id: path,
            uuid: event.payload.uuid,
            positive: event.payload.positive,
            start: event.payload.start,
          });
          timers.value.push(timer);
          return;
        }
        case "timer_stopped": {
          // "First stop wins": if this timer is already closed (e.g. we closed it locally before
          // seeing this remote event), leave its end time alone.
          const timer = timers.value.find((t) => t.uuid === event.payload.uuid);
          if (timer && timer.end === 0) {
            timer.end = event.payload.end;
          }
          return;
        }
        case "timer_updated": {
          // Unlike tag_updated, there's no sensible fallback insert here if the timer_started
          // hasn't been seen yet - a bare edit payload has no tagUuid to resolve an id from - so
          // just drop it; the eventual timer_started/timer_updated replay order isn't guaranteed,
          // but this is a rare edge case (editing a record before its creation event arrives).
          const timer = timers.value.find((t) => t.uuid === event.payload.uuid);
          if (!timer || event.timestamp <= timer.updatedAt) {
            return; // missing, or a newer local edit wins (last-write-wins)
          }
          timer.start = event.payload.start;
          timer.end = event.payload.end;
          timer.description = event.payload.description;
          timer.positive = event.payload.positive;
          timer.updatedAt = event.timestamp;
          return;
        }
        case "timer_removed": {
          timers.value = timers.value.filter((t) => t.uuid !== event.payload.uuid);
          return;
        }
      }
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
      const uuid = crypto.randomUUID();
      const start = Date.now();
      const timer = timerSchema.parse({ id, uuid, positive, start });
      timers.value.push(timer);
      now.value = Date.now();

      const tagUuid = resolveTagUuid(id);
      if (tagUuid === null) {
        // Should be unreachable in practice - startTimer is always called with an existing tag's
        // path - but if it ever isn't, drop the sync event rather than push a payload the backend
        // can't resolve.
        console.warn(`Sync: could not resolve tag for timer "${id}" - skipping sync event`);
        return;
      }
      useSyncStore().enqueueEvent({
        id: crypto.randomUUID(),
        type: "timer_started",
        entityId: uuid,
        deviceId: useSyncStore().deviceId,
        timestamp: start,
        payload: { uuid, tagUuid, positive, start },
      });
    };
    const stopTimer = (id: string, positive: boolean | undefined = undefined) => {
      const stoppedAt = Date.now();
      for (const timer of timers.value) {
        if (
          timer.id === id &&
          timer.end === 0 &&
          (positive === undefined || timer.positive === positive)
        ) {
          timer.end = stoppedAt;
          useSyncStore().enqueueEvent({
            id: crypto.randomUUID(),
            type: "timer_stopped",
            entityId: timer.uuid,
            deviceId: useSyncStore().deviceId,
            timestamp: stoppedAt,
            payload: { uuid: timer.uuid, end: stoppedAt },
          });
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
      const stoppedAt = Date.now();
      for (const timer of timers.value) {
        if (!timer.positive && timer.end === 0 && isSelfOrDescendant(id, timer.id)) {
          timer.end = stoppedAt;
          useSyncStore().enqueueEvent({
            id: crypto.randomUUID(),
            type: "timer_stopped",
            entityId: timer.uuid,
            deviceId: useSyncStore().deviceId,
            timestamp: stoppedAt,
            payload: { uuid: timer.uuid, end: stoppedAt },
          });
        }
      }
    };
    const updateTimer = (
      uuid: string,
      fields: { start: number; end: number; description: string; positive: boolean },
    ) => {
      const timer = timers.value.find((t) => t.uuid === uuid);
      if (!timer) {
        return;
      }
      const timestamp = Date.now();
      timer.start = fields.start;
      timer.end = fields.end;
      timer.description = fields.description;
      timer.positive = fields.positive;
      timer.updatedAt = timestamp;
      useSyncStore().enqueueEvent({
        id: crypto.randomUUID(),
        type: "timer_updated",
        entityId: timer.uuid,
        deviceId: useSyncStore().deviceId,
        timestamp,
        payload: {
          uuid: timer.uuid,
          start: fields.start,
          end: fields.end,
          description: fields.description,
          positive: fields.positive,
        },
      });
    };

    const removeTimer = (uuid: string) => {
      const timer = timers.value.find((t) => t.uuid === uuid);
      if (!timer) {
        return;
      }
      timers.value = timers.value.filter((t) => t.uuid !== uuid);
      useSyncStore().enqueueEvent({
        id: crypto.randomUUID(),
        type: "timer_removed",
        entityId: timer.uuid,
        deviceId: useSyncStore().deviceId,
        timestamp: Date.now(),
        payload: { uuid: timer.uuid },
      });
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
      reportDayStart,
      reportDayEnd,
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
      updateTag,
      removeTag,
      migrateUuids,
      applyRemoteEvent,
      quickStartTag,
      openModal,
      closeModal,
      isModal,
      startTimer,
      stopTimer,
      isRunning,
      resumeTimer,
      updateTimer,
      removeTimer,
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
