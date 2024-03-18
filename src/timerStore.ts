import { defineStore } from "pinia";
import { ref } from "vue";
import { timerSchema, type fhtTag, type fhtTimer } from "./types";
import { modalName } from "./helpers";

export const useTimerStore = defineStore(
  "timer",
  () => {
    const tags = ref(<fhtTag[]>[]);
    const timers = ref(<fhtTimer[]>[]);
    const modal = ref("");
    const now = ref(Date.now());

    // Actions
    const getTags = (parentTag: string): fhtTag[] => {
      return tags.value.filter((tag) => {
        return tag.parent === parentTag;
      });
    };
    const removeTag = (remove: string) => {
      tags.value = tags.value.filter((tag) => {
        const id = `${tag.parent}//${tag.name}`;
        return !id.startsWith(remove);
      });
      modal.value = "";
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
    const stopTimer = (id: string) => {
      for (const timer of timers.value) {
        if (timer.id === id && timer.end === 0) {
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
    const getTime = (id: string) => {
      const records: Array<{ start: number; end: number }> = [];
      for (const timer of timers.value.sort((a, b) => a.start - b.start)) {
        if (timer.positive && timer.id.startsWith(id)) {
          const start = timer.start;
          const end = timer.end > 0 ? timer.end : now.value;
          let push = true;
          for (const r of records) {
            if (start < r.end) {
              if (end > r.end) {
                r.end = end;
              }
              push = false;
              break;
            }
          }
          if (push) {
            records.push({ start, end });
          }
        }
      }
      for (const timer of timers.value) {
        if (!timer.positive && id.startsWith(timer.id)) {
          const start = timer.start;
          const end = timer.end > 0 ? timer.end : now.value;
          for (const r of records) {
            if (start > r.start && end < r.end) {
              // Timer is in the middle.
              records.push({start: end, end: r.end});
              r.end = start;
            } else if (start > r.start && start < r.end) {
              // Timer overlaps the start.
              r.end = start;
            } else if (end > r.start && end < r.end) {
              // Timer overlaps the end.
              r.start = end;
            }
          }
        }
      }

      let time = 0;
      for (const r of records) {
        time += r.end - r.start;
      }
      return time;
    };

    return {
      tags,
      timers,
      modal,
      now,
      getTags,
      removeTag,
      openModal,
      closeModal,
      isModal,
      startTimer,
      stopTimer,
      isRunning,
      getTime,
    };
  },
  {
    persist: {
      paths: ["tags", "timers"],
    },
  },
);
