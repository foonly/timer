import { defineStore } from "pinia";
import { ref } from "vue";
import { timerTag } from "./types";

export const useTimerStore = defineStore(
  "timer",
  () => {
    const count = ref(0);
    const tags = ref([] as timerTag[]);

    return { count, tags };
  },
  { persist: true }
);
