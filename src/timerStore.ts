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
    };
  },
  {
    persist: {
      paths: ["tags", "timers", "modal"],
    },
  },
);
