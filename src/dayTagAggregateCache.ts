// A plain (non-reactive) cache of precomputed per-day, per-tag time totals for history old enough
// that it's no longer actively edited - see timerStore.ts's getDayAggregate for the eligibility
// rule and invalidateForTimer for how entries are kept correct as old records do occasionally
// still change (a manual edit, a removed tag, a replayed sync event).
//
// Deliberately a plain Map, not a Vue ref/reactive: this is read and written from inside Vue
// computeds (reportEntries, reportDayTotal, ...), and a reactive map would (a) register a spurious
// dependency on the cache's own internal state and (b) mutate tracked state from within a
// computed's own evaluation. A plain Map is invisible to Vue's dependency tracker on both read and
// write, which is exactly the point - reading a cached historical total must not create a
// dependency on the live clock, or the whole point of caching it is lost.
//
// Not persisted to localStorage: this is cheap, always-reconstructible derived data. Persisting it
// would add write cost for no durability benefit, and risks a cache written under one version of
// the aggregation logic silently outliving a later change to that logic.
export interface DayTagAggregate {
  // Union of the day's tracked intervals for this tag (and descendants), so concurrent tracking
  // isn't double-counted - matches what getTimeInRange returns.
  netTime: number;
  // Sum of each tracked interval's own duration - matches what getRawTimeInRange returns.
  rawTime: number;
  // True if any timer contributing to this total was still open (end === 0) when computed - such
  // a result is never written to the cache (see timerStore.ts's getDayAggregate).
  volatile: boolean;
}

const cache = new Map<number, Map<string, DayTagAggregate>>();

export function getCached(dayNumber: number, id: string): DayTagAggregate | undefined {
  return cache.get(dayNumber)?.get(id);
}

export function setCached(dayNumber: number, id: string, value: DayTagAggregate): void {
  let byId = cache.get(dayNumber);
  if (!byId) {
    byId = new Map();
    cache.set(dayNumber, byId);
  }
  byId.set(id, value);
}

export function invalidateDay(dayNumber: number, id: string): void {
  cache.get(dayNumber)?.delete(id);
}

export function invalidateAll(): void {
  cache.clear();
}
