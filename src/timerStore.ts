import { defineStore } from "pinia";
import { ref } from "vue";
import { fhtTag } from "./types";

export const useTimerStore = defineStore(
  "timer",
  () => {
    const tags = ref([] as fhtTag[]);
    const modal = ref("");

    // Getters
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

    return { tags, modal, getTags, removeTag };
  },
  { persist: true }
);
