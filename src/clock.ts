import { ref } from "vue";
import { MS_PER_DAY, getDayStart } from "./helpers";

// Deliberately kept outside any Pinia store: "the current time" isn't app data worth persisting,
// and a plain ref here can't trigger a store's $subscribe. If it lived in useTimerStore instead,
// ticking it every second would fire that store's persistence write (and, later, a backend sync
// layered on the same subscription) once a second even though tags/timers never changed.
export const now = ref(Date.now());
export const dayStarts = ref(getDayStart());

let intervalHandle = 0;

export function startClock() {
  if (intervalHandle > 0) {
    clearInterval(intervalHandle);
  }
  intervalHandle = setInterval(() => {
    now.value = Date.now();
    if (now.value >= dayStarts.value + MS_PER_DAY) {
      dayStarts.value = getDayStart();
    }
  }, 1000);
}
