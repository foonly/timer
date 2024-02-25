import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { timerTag } from "./types";

export const useTimerStore = defineStore(
  "timer",
  () => {
    const count = ref(0);
    const tags = ref([] as timerTag[]);

    // Getters
    const rootTags = computed<timerTag[]>(() =>
      tags.value.filter((tag) => {
        return tag.name.indexOf("//") === -1;
      })
    );
    const getTags = (parentTag: string): timerTag[] => {
      return tags.value.filter((tag) => {
        return tag.parent === parentTag;
      });
    };

    return { count, tags, rootTags, getTags };
  },
  { persist: true }
);
