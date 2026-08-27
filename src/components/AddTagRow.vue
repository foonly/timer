<script setup lang="ts">
import { useTimerStore } from "../timerStore";
import Plus from "../assets/plus.svg";
import QuickStartButton from "./QuickStartButton.vue";

const store = useTimerStore();
const props = defineProps<{ parent: string }>();
</script>

<template>
  <div class="add-row icons" :class="{ root: !props.parent }">
    <Plus
      class="icon clickable"
      title="Add tag"
      @click="store.openModal('add-tag', props.parent)"
    />
    <QuickStartButton :parent="props.parent" />
  </div>
</template>

<style scoped>
.add-row {
  padding: 0.5rem 0;
}
.add-row.root {
  margin-left: 1rem;
}
</style>
