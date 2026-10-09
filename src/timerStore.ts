import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { tagSchema, timerSchema, type fhtTag, type fhtTimer, type timerStatus } from "./types";
import {
  modalName,
  pathOf,
  getDayNumber,
  getTimeFromDays,
  formatDayLabel,
  isSelfOrDescendant,
  ancestorChainIds,
  timerOverlapsRange,
  MS_PER_DAY,
  OLD_DAY_CACHE_THRESHOLD_DAYS,
} from "./helpers";
import { randomTagName } from "./randomNames";
import { now, dayStarts } from "./clock";
import { useSyncStore } from "./syncStore";
import type { SyncEvent } from "./sync/events";
import { getCached, setCached, invalidateDay, invalidateAll } from "./dayTagAggregateCache";
import type { DayTagAggregate } from "./dayTagAggregateCache";

export const useTimerStore = defineStore(
  "timer",
  () => {
    const tags = ref<fhtTag[]>([]);
    const timers = ref<fhtTimer[]>([]);
    const modal = ref("");
    // Which tags are shown collapsed, by tag id. Local-only UI state - deliberately never wired
    // into a sync event, so it stays device-specific instead of following the tag across devices.
    const collapsedTagIds = ref<string[]>([]);
    // null means "today" and tracks the real day as it advances; a number pins the report to
    // that specific day so browsing history doesn't get yanked forward by a real day rollover.
    const viewedDayNumber = ref<number | null>(null);
    // Set the first time the user answers (either way) the "run the setup wizard?" prompt, so it
    // never asks again - even if the store is still empty later (e.g. they declined, or accepted
    // then bailed out without creating anything).
    const wizardPromptDismissed = ref(false);

    // Getters
    const dayEnds = computed(() => {
      return dayStarts.value + MS_PER_DAY;
    });

    const todayDayNumber = computed(() => getDayNumber(now.value));
    const reportDayNumber = computed(() => viewedDayNumber.value ?? todayDayNumber.value);
    const reportDayStart = computed(() => getTimeFromDays(reportDayNumber.value));
    const reportDayEnd = computed(() => reportDayStart.value + MS_PER_DAY);
    const isViewingToday = computed(() => reportDayNumber.value === todayDayNumber.value);
    const reportDayLabel = computed(() =>
      formatDayLabel(reportDayNumber.value, todayDayNumber.value),
    );

    // Bounded to just today's (and any still-open) records, so per-second UI ticks that read this
    // (see getTime, driving TagItem.vue's live display) don't rescan the entire lifetime history.
    // Depends only on timers.value (structural changes) and dayStarts.value (once/day) - never on
    // `now`, so it isn't rebuilt every clock tick.
    const todaysTimers = computed(() =>
      timers.value.filter((t) => t.end === 0 || t.end > dayStarts.value),
    );

    // Clears every cached aggregate that `timer` could have contributed to: every day it spans,
    // and its own id plus every ancestor id - getDayAggregate sums over an id and all of its
    // descendants, so a leaf timer's change can affect an ancestor's cached total too.
    const invalidateForTimer = (timer: { id: string; start: number; end: number }) => {
      const effectiveEnd = timer.end > 0 ? timer.end : now.value;
      const firstDay = getDayNumber(timer.start);
      const lastDay = getDayNumber(Math.max(timer.start, effectiveEnd - 1));
      for (let day = firstDay; day <= lastDay; day++) {
        for (const ancestorId of ancestorChainIds(timer.id)) {
          invalidateDay(day, ancestorId);
        }
      }
    };

    // Actions
    const getTags = (parentTag: string): fhtTag[] => {
      return tags.value
        .filter((tag) => {
          return tag.parent === parentTag;
        })
        .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    };

    // Sparse gaps between sibling `order` values so a single drag-reorder only ever has to
    // rewrite the moved tag's own order (as a midpoint of its new neighbors), never renumber
    // every sibling - see `moveTag`.
    const ORDER_GAP = 1000;

    const nextOrderAfter = (parent: string): number => {
      const siblings = getTags(parent);
      return siblings.length ? siblings[siblings.length - 1].order + ORDER_GAP : 0;
    };

    // Tags are identified by their `${parent}//${name}` path everywhere outside sync, so a name
    // that's empty, contains the "//" separator, or collides with a sibling would make two tags
    // (or a tag and its own child) indistinguishable. Returns "" when `name` is usable under
    // `parent`; `ignoreUuid` excludes the tag being edited from the sibling-collision check.
    const tagNameError = (parent: string, name: string, ignoreUuid?: string): string => {
      const trimmed = name.trim();
      if (!trimmed) {
        return "Name is required.";
      }
      if (trimmed.includes("//")) {
        return 'Name can\'t contain "//".';
      }
      if (getTags(parent).some((t) => t.name === trimmed && t.uuid !== ignoreUuid)) {
        return "A tag with that name already exists here.";
      }
      return "";
    };

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
      order: number,
    ) => {
      const existing = tags.value.find((t) => t.uuid === uuid);
      if (existing) {
        return existing;
      }
      const tag = tagSchema.parse({ uuid, parent, name, description, updatedAt, order });
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
      fields: { name: string; parent: string; description: string; order: number },
      timestamp: number,
    ) => {
      const id = pathOf(tag);
      const newId = pathOf(fields);
      tag.name = fields.name;
      tag.description = fields.description;
      tag.parent = fields.parent;
      tag.updatedAt = timestamp;
      // Set unconditionally, before the early return below - a pure same-parent reorder never
      // changes `id` at all, so the order write must not be skipped in that case.
      tag.order = fields.order;

      if (newId === id) {
        return;
      }
      // A rename/reparent can rewrite the `id` of an unbounded number of timers across an
      // unbounded number of days at once (the whole subtree's history moves with it) - targeted
      // per-timer invalidation would need to walk both the old and new ancestor chains for each,
      // for real but marginal benefit on what's already a rare, user-triggered, non-hot-path
      // action that already does a full O(tags + timers) walk. A full clear is simpler and cheap
      // by comparison.
      invalidateAll();
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
      // Collapse state is keyed by path too, so it has to follow the subtree or a rename would
      // silently expand the tag (and any collapsed descendants).
      collapsedTagIds.value = collapsedTagIds.value.map((c) =>
        isSelfOrDescendant(c, id) ? newId + c.slice(id.length) : c,
      );
    };

    // Shared by removeTag (local) and applyRemoteEvent's tag_removed handling - the actual
    // subtree-stop-then-filter mutation, without the local-only modal/event-emission side effects.
    const removeTagInternal = (remove: string, stoppedAt: number) => {
      // Once the tag is gone there's no card left to click Stop/Resume on, so any timer still
      // open on it or a descendant would otherwise run (or stay paused) forever, uncontrollably.
      for (const timer of timers.value) {
        if (timer.end === 0 && isSelfOrDescendant(timer.id, remove)) {
          timer.end = stoppedAt;
          invalidateForTimer({ id: timer.id, start: timer.start, end: stoppedAt });
        }
      }
      tags.value = tags.value.filter((tag) => !isSelfOrDescendant(pathOf(tag), remove));
    };

    const addTag = (parent: string, name: string, description = "") => {
      const uuid = crypto.randomUUID();
      const updatedAt = Date.now();
      const order = nextOrderAfter(parent);
      const tag = insertTag(uuid, parent, name, description, updatedAt, order);
      useSyncStore().emitEvent("tag_added", uuid, updatedAt, {
        uuid,
        parentUuid: resolveTagUuid(parent),
        name,
        description,
        order,
      });
      return tag;
    };

    const updateTag = (
      id: string,
      fields: { name: string; parent: string; description: string; order: number },
    ) => {
      const tag = tags.value.find((t) => pathOf(t) === id);
      if (!tag) {
        return;
      }
      const timestamp = Date.now();
      renameTagInPlace(tag, fields, timestamp);
      useSyncStore().emitEvent("tag_updated", tag.uuid, timestamp, {
        uuid: tag.uuid,
        parentUuid: resolveTagUuid(fields.parent),
        name: fields.name,
        description: fields.description,
        order: fields.order,
      });
    };

    // Drag-and-drop entry point: reorders `id` among the siblings of `newParent`, landing at
    // `newIndex` (an index into that parent's sibling list with `id` itself excluded) - and, when
    // `newParent` differs from the tag's current parent, reparents it there too. Reparenting reuses
    // updateTag/renameTagInPlace's existing cascade, which already rewrites every descendant tag's
    // `parent` and every affected timer's `id`, so a moved tag's history moves with it intact.
    const moveTag = (id: string, newParent: string, newIndex: number) => {
      const tag = tags.value.find((t) => pathOf(t) === id);
      if (!tag) {
        return;
      }
      // Refuse to drop a tag into itself or one of its own descendants - would otherwise create a
      // cycle that getTags/isSelfOrDescendant (and the whole recursive tree render) can't handle.
      if (newParent === id || isSelfOrDescendant(newParent, id)) {
        return;
      }
      const siblings = getTags(newParent).filter((t) => t.uuid !== tag.uuid);
      const before = siblings[newIndex - 1];
      const after = siblings[newIndex];
      let order: number;
      if (!before && !after) {
        order = 0;
      } else if (!before) {
        order = after.order - ORDER_GAP;
      } else if (!after) {
        order = before.order + ORDER_GAP;
      } else {
        order = (before.order + after.order) / 2;
      }
      updateTag(id, { name: tag.name, parent: newParent, description: tag.description, order });
    };

    const removeTag = (remove: string) => {
      const removedTag = tags.value.find((t) => pathOf(t) === remove);
      const stoppedAt = Date.now();
      removeTagInternal(remove, stoppedAt);
      modal.value = "";
      if (removedTag) {
        useSyncStore().emitEvent("tag_removed", removedTag.uuid, stoppedAt, {
          uuid: removedTag.uuid,
        });
      }
    };

    // Backfills `uuid`/`updatedAt`/`order` on any tag/timer that predates the sync/ordering
    // features - persisted state is written straight into these refs on load, bypassing
    // tagSchema/timerSchema's zod defaults, so this has to run explicitly once at startup (see
    // main.ts) before anything else touches tags/timers.
    const migrateUuids = () => {
      // Assigns sequential, gapped order values per parent group, walking tags.value in its
      // existing (historical insertion) order - so upgrading doesn't visibly reshuffle anyone's
      // current tag order.
      const nextOrderByParent = new Map<string, number>();
      for (const tag of tags.value) {
        if (!tag.uuid) {
          tag.uuid = crypto.randomUUID();
        }
        if (!tag.updatedAt) {
          tag.updatedAt = Date.now();
        }
        if (tag.order === undefined) {
          const order = nextOrderByParent.get(tag.parent) ?? 0;
          tag.order = order;
          nextOrderByParent.set(tag.parent, order + ORDER_GAP);
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
            event.payload.order,
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
              event.payload.order,
            );
            return;
          }
          if (event.timestamp <= tag.updatedAt) {
            return; // a newer local edit wins (last-write-wins)
          }
          renameTagInPlace(
            tag,
            {
              name: event.payload.name,
              parent,
              description: event.payload.description,
              order: event.payload.order,
            },
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
          // null tagUuid means the root/global timer ("" path) - not a lookup failure.
          const path =
            event.payload.tagUuid === null ? "" : findTagPathByUuid(event.payload.tagUuid);
          if (path === undefined) {
            console.warn(`Sync: unknown tag for timer ${event.payload.uuid} - skipping`);
            return;
          }
          const timer = timerSchema.parse({
            id: path,
            uuid: event.payload.uuid,
            positive: event.payload.positive,
            start: event.payload.start,
            // The event's own time, not "now" (the schema default): timer_updated is
            // last-write-wins against updatedAt, so stamping it with when this device happened to
            // pull would make it silently ignore any edit made before then.
            updatedAt: event.timestamp,
          });
          timers.value.push(timer);
          invalidateForTimer(timer);
          return;
        }
        case "timer_stopped": {
          // "First stop wins": if this timer is already closed (e.g. we closed it locally before
          // seeing this remote event), leave its end time alone.
          const timer = timers.value.find((t) => t.uuid === event.payload.uuid);
          if (timer && timer.end === 0) {
            // Only the newly-closed range needs invalidating: a day is never cached while any
            // contributing timer is still open (see getDayAggregate), so the "was open" side of
            // this transition was never memoized in the first place.
            invalidateForTimer({ id: timer.id, start: timer.start, end: event.payload.end });
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
          invalidateForTimer({ id: timer.id, start: timer.start, end: timer.end });
          timer.start = event.payload.start;
          timer.end = event.payload.end;
          timer.description = event.payload.description;
          timer.positive = event.payload.positive;
          timer.updatedAt = event.timestamp;
          invalidateForTimer({ id: timer.id, start: timer.start, end: timer.end });
          return;
        }
        case "timer_removed": {
          const timer = timers.value.find((t) => t.uuid === event.payload.uuid);
          if (timer) {
            invalidateForTimer({ id: timer.id, start: timer.start, end: timer.end });
          }
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
      startTimer(pathOf({ parent, name }));
    };
    const isCollapsed = (id: string) => collapsedTagIds.value.includes(id);
    const toggleCollapsed = (id: string) => {
      if (!collapsedTagIds.value.includes(id)) {
        collapsedTagIds.value.push(id);
      } else {
        collapsedTagIds.value = collapsedTagIds.value.filter((c) => c !== id);
      }
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
      if (tagUuid === null && id !== "") {
        // Should be unreachable in practice - startTimer is always called with an existing tag's
        // path, except the id === "" root/global case (resolveTagUuid legitimately returns null
        // there - see its own comment) - but if it ever isn't, drop the sync event rather than
        // push a payload the backend can't resolve.
        console.warn(`Sync: could not resolve tag for timer "${id}" - skipping sync event`);
        return;
      }
      useSyncStore().emitEvent("timer_started", uuid, start, { uuid, tagUuid, positive, start });
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
          useSyncStore().emitEvent("timer_stopped", timer.uuid, stoppedAt, {
            uuid: timer.uuid,
            end: stoppedAt,
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
          useSyncStore().emitEvent("timer_stopped", timer.uuid, stoppedAt, {
            uuid: timer.uuid,
            end: stoppedAt,
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
      invalidateForTimer({ id: timer.id, start: timer.start, end: timer.end });
      timer.start = fields.start;
      timer.end = fields.end;
      timer.description = fields.description;
      timer.positive = fields.positive;
      timer.updatedAt = timestamp;
      invalidateForTimer({ id: timer.id, start: timer.start, end: timer.end });
      useSyncStore().emitEvent("timer_updated", timer.uuid, timestamp, {
        uuid: timer.uuid,
        start: fields.start,
        end: fields.end,
        description: fields.description,
        positive: fields.positive,
      });
    };

    const removeTimer = (uuid: string) => {
      const timer = timers.value.find((t) => t.uuid === uuid);
      if (!timer) {
        return;
      }
      invalidateForTimer({ id: timer.id, start: timer.start, end: timer.end });
      timers.value = timers.value.filter((t) => t.uuid !== uuid);
      useSyncStore().emitEvent("timer_removed", timer.uuid, Date.now(), { uuid: timer.uuid });
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
    // a deduped union. Also reports whether any window timer was still open (end === 0), which
    // getDayAggregate uses to decide whether a result is safe to cache long-term.
    //
    // Filtering (and clipping) by overlap rather than by `t.start` alone matters for a timer that
    // was already running when rangeStart hit (e.g. one still open from before the 04:00 day
    // cutoff): it must contribute its portion inside this window even though it started earlier,
    // and correspondingly must NOT contribute the portion outside this window - otherwise that
    // time either vanishes (excluded from every day) or gets double-counted (attributed both to
    // the day it started on and the day it's viewed from).
    //
    // `nowValue`/`candidates` are explicit parameters (defaulting to the live clock/full history)
    // rather than closed over, mirroring timerOverlapsRange's own convention: it lets a past day's
    // total be computed with a fixed sentinel instead of the live clock (so it creates no reactive
    // dependency on it) and lets today's total be computed over a small pre-filtered candidate list
    // instead of the entire lifetime history (see todaysTimers).
    const getRecordsInRange = (
      id: string,
      rangeStart: number,
      rangeEnd: number,
      nowValue: number = now.value,
      candidates: fhtTimer[] = timers.value,
    ) => {
      const clipToRange = (t: { start: number; end: number }) => ({
        start: Math.max(t.start, rangeStart),
        end: Math.min(t.end > 0 ? t.end : nowValue, rangeEnd),
      });

      const windowTimers = candidates.filter((t) =>
        timerOverlapsRange(t, rangeStart, rangeEnd, nowValue),
      );
      const touchesOpenTimer = windowTimers.some((t) => t.end === 0);

      const records: Array<{ start: number; end: number; id: string }> = [];
      // Clone the timer records to be able to modify them.
      for (const timer of windowTimers.filter((t) => t.positive && isSelfOrDescendant(t.id, id))) {
        records.push({ ...clipToRange(timer), id: timer.id });
      }

      // Subtract negative timers from the records.
      for (const timer of windowTimers.filter((t) => !t.positive)) {
        const { start, end } = clipToRange(timer);
        for (const r of records) {
          if (!isSelfOrDescendant(r.id, timer.id) || end <= r.start || start >= r.end) {
            continue;
          }
          if (start > r.start && end < r.end) {
            // Pause is strictly inside the record, split the record.
            records.push({ start: end, end: r.end, id: r.id });
            r.end = start;
          } else if (start > r.start) {
            // Pause overlaps the record's end.
            r.end = start;
          } else if (end < r.end) {
            // Pause overlaps the record's start.
            r.start = end;
          } else {
            // Pause covers the whole record.
            r.end = r.start;
          }
        }
      }

      return { records, touchesOpenTimer };
    };

    // Sum of each record's own duration, so two timers tracked concurrently (e.g. on unrelated
    // tags) each contribute their full length even though they cover the same wall-clock time.
    const sumRawTime = (records: Array<{ start: number; end: number }>) =>
      records.reduce((sum, r) => sum + (r.end - r.start), 0);

    // Union of the records' time ranges, so concurrent/overlapping records (e.g. a broad tag and a
    // nested sub-tag both tracked at once) count that wall-clock time only once. `coveredUntil`
    // tracks the furthest point the union has reached so far - a record that ends before that point
    // is already fully covered and contributes nothing, and one that extends past it only
    // contributes the new, not-yet-covered portion.
    const unionTime = (records: Array<{ start: number; end: number }>) => {
      let time = 0;
      let coveredUntil = 0;
      for (const r of [...records].sort((a, b) => a.start - b.start)) {
        if (r.end <= coveredUntil) {
          continue;
        }
        time += r.end - Math.max(r.start, coveredUntil);
        coveredUntil = r.end;
      }
      return time;
    };

    const getTimeInRange = (
      id: string,
      rangeStart: number,
      rangeEnd: number,
      nowValue: number = now.value,
      candidates: fhtTimer[] = timers.value,
    ) => unionTime(getRecordsInRange(id, rangeStart, rangeEnd, nowValue, candidates).records);

    // "Today" only - always computed live over the small todaysTimers candidate list (see its own
    // comment), never routed through the day-aggregate cache below (today is never cache-eligible).
    const getTime = (id: string) =>
      getTimeInRange(id, dayStarts.value, dayEnds.value, now.value, todaysTimers.value);

    const isDayCacheEligible = (dayNumber: number) =>
      todayDayNumber.value - dayNumber >= OLD_DAY_CACHE_THRESHOLD_DAYS;

    // The actual from-scratch computation getDayAggregate falls back to on a cache miss - split
    // out so a dev-mode cache hit can also call it, to cross-check that the cache never disagrees
    // with a fresh scan (see the DEV branch in getDayAggregate below).
    const computeDayAggregate = (id: string, dayNumber: number): DayTagAggregate => {
      const isPast = dayNumber < todayDayNumber.value;
      const rangeStart = getTimeFromDays(dayNumber);
      const rangeEnd = rangeStart + MS_PER_DAY;
      // A day that's fully in the past has a provably fixed set of records regardless of the
      // current time - using a fixed sentinel here (rather than now.value) means this computation
      // never reads the live clock, so it creates no reactive dependency on it.
      const nowValue = isPast ? Number.MAX_SAFE_INTEGER : now.value;
      const { records, touchesOpenTimer } = getRecordsInRange(id, rangeStart, rangeEnd, nowValue);
      return {
        rawTime: sumRawTime(records),
        netTime: unionTime(records),
        volatile: touchesOpenTimer,
      };
    };

    // The single cache-aware entry point for "total time for `id` on day `dayNumber`". Days more
    // than OLD_DAY_CACHE_THRESHOLD_DAYS in the past are served from dayTagAggregateCache once
    // computed; today and recent days always compute live so they reflect the running clock and
    // in-progress edits immediately. A result is only ever cached when nothing contributing to it
    // was still open at compute time (see `volatile` on DayTagAggregate) - an open timer's true
    // contribution to a day isn't known until it closes.
    const getDayAggregate = (id: string, dayNumber: number): DayTagAggregate => {
      const eligible = isDayCacheEligible(dayNumber);
      if (eligible) {
        const cached = getCached(dayNumber, id);
        if (cached) {
          // Dev-only: on every cache hit, also recompute live and flag any disagreement. Zero
          // cost in production (import.meta.env.DEV is false there) - this is a continuous
          // correctness check against the user's own real historical data, which is more
          // representative than any fixed set of synthetic test fixtures could be.
          if (import.meta.env.DEV) {
            const fresh = computeDayAggregate(id, dayNumber);
            if (fresh.netTime !== cached.netTime || fresh.rawTime !== cached.rawTime) {
              console.error(
                `Day-tag aggregate cache mismatch for day ${dayNumber}, id "${id}": ` +
                  `cached=${JSON.stringify(cached)} fresh=${JSON.stringify(fresh)}`,
              );
            }
          }
          return cached;
        }
      }
      const result = computeDayAggregate(id, dayNumber);
      if (eligible && !result.volatile) {
        setCached(dayNumber, id, result);
      }
      return result;
    };

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
      // A fully past viewed day has a fixed set of records regardless of the current time - using
      // a fixed sentinel instead of now.value means this computed doesn't depend on the clock (and
      // so doesn't re-run every tick) while viewing an old day. Mirrors getDayAggregate's own
      // isPast/nowValue choice for the same day, so the two stay consistent.
      const isPast = reportDayNumber.value < todayDayNumber.value;
      const nowValue = isPast ? Number.MAX_SAFE_INTEGER : now.value;
      const entries: Array<{ id: string; time: number }> = [];

      const knownTagIds = new Set(tags.value.map(pathOf));
      const parentOf = (id: string) => id.slice(0, id.lastIndexOf("//"));

      // A deleted id whose own tag never had a direct timer (only a deleted descendant did, e.g.
      // a tag that only ever showed sub-timer activity) has no timer record of its own to spot it
      // by - so also synthesize every such intermediate ancestor, up to the first id that's still
      // a known tag (or the root), so the walk below can still reach that descendant at all.
      //
      // `""` (the root itself, e.g. from the global pause-everything timer) is excluded here even
      // though it's never a known tag: `parentOf("")` is also `""`, so treating it as a deleted
      // leaf would make it its own synthesized child, and `visit("")` would recurse into itself
      // forever.
      const dayTimers = timers.value.filter((t) => timerOverlapsRange(t, start, end, nowValue));
      const deletedLeafIds = new Set(
        dayTimers.map((t) => t.id).filter((id) => id !== "" && !knownTagIds.has(id)),
      );
      const deletedIds = new Set(deletedLeafIds);
      for (const id of deletedLeafIds) {
        let ancestor = parentOf(id);
        while (ancestor !== "" && !knownTagIds.has(ancestor) && !deletedIds.has(ancestor)) {
          deletedIds.add(ancestor);
          ancestor = parentOf(ancestor);
        }
      }
      // Earliest start among the day's timers on each id or any of its descendants - computed in
      // one pass (each timer credits its own id and every ancestor) so the sort below is a lookup,
      // not a rescan of the day's timers per comparison.
      const earliestStart = new Map<string, number>();
      for (const t of dayTimers) {
        for (const id of ancestorChainIds(t.id)) {
          earliestStart.set(id, Math.min(earliestStart.get(id) ?? Infinity, t.start));
        }
      }
      const earliestActivity = (id: string) => earliestStart.get(id) ?? Infinity;

      const visit = (parent: string) => {
        const liveIds = getTags(parent).map(pathOf);
        const deletedChildIds = [...deletedIds].filter((id) => parentOf(id) === parent);
        const children = [...liveIds, ...deletedChildIds].sort(
          (a, b) => earliestActivity(a) - earliestActivity(b),
        );
        for (const id of children) {
          const time = getDayAggregate(id, reportDayNumber.value).netTime;
          if (time > 0) {
            entries.push({ id, time });
          }
          visit(id);
        }
      };
      visit("");

      return entries;
    });

    // Shared by reportDayTotal/reportDayActiveTime below so the underlying scan (and cache lookup)
    // for the viewed day's root aggregate only happens once, not once per computed.
    const reportDayRootAggregate = computed(() => getDayAggregate("", reportDayNumber.value));

    // "Total tracked": every tracked timer counts its full length, even if two ran concurrently
    // (e.g. on unrelated tags) - a measure of total logged effort, not wall-clock time.
    const reportDayTotal = computed(() => reportDayRootAggregate.value.rawTime);

    // "Time active": the wall-clock time during which at least one timer was running that day -
    // concurrent/overlapping timers are merged so that time isn't counted twice.
    const reportDayActiveTime = computed(() => reportDayRootAggregate.value.netTime);

    return {
      tags,
      timers,
      modal,
      wizardPromptDismissed,
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
      tagNameError,
      addTag,
      updateTag,
      moveTag,
      nextOrderAfter,
      removeTag,
      migrateUuids,
      applyRemoteEvent,
      quickStartTag,
      openModal,
      closeModal,
      isModal,
      isCollapsed,
      toggleCollapsed,
      startTimer,
      stopTimer,
      isRunning,
      isPausedNow,
      resumeTimer,
      updateTimer,
      removeTimer,
      getStatus,
      getTime,
    };
  },
  {
    persist: {
      paths: ["tags", "timers", "collapsedTagIds", "wizardPromptDismissed"],
    },
  },
);
