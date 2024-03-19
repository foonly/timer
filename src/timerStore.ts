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
      const records: Array<{ start: number; end: number; id: string }> = [];
      // Clone the timer records to be able to modify them.
      for (const timer of timers.value.filter((t) => t.positive && t.id.startsWith(id))) {
        records.push({
          start: timer.start,
          end: timer.end > 0 ? timer.end : now.value,
          id: timer.id,
        });
      }

      // Subtract negative timers from the records.
      for (const timer of timers.value.filter((t) => !t.positive)) {
        const start = timer.start;
        const end = timer.end > 0 ? timer.end : now.value;
        for (const r of records) {
          if (r.id.startsWith(timer.id)) {
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

      // Add up the remaining records.
      let time = 0;
      let lastEnd = 0;
      for (const r of records.sort((a, b) => a.start - b.start)) {
        if (r.start < lastEnd && r.end > lastEnd) {
          // Records are overlapping.
          time += r.end - lastEnd;
        } else {
          // No overlap.
          time += r.end - r.start;
        }
        lastEnd = r.end;
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
