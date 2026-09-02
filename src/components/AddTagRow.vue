<script setup lang="ts">
import { useTimerStore } from "../timerStore";
import Plus from "../assets/plus.svg";
import QuickStartButton from "./QuickStartButton.vue";
import IconButton from "./IconButton.vue";

const store = useTimerStore();
const props = defineProps<{ parent: string }>();
</script>

<template>
  <div class="add-row icons" :class="{ root: !props.parent }">
    <IconButton label="Add tag" @click="store.openModal('add-tag', props.parent)">
      <Plus class="icon" />
    </IconButton>
    <QuickStartButton :parent="props.parent" />
  </div>
</template>

<style scoped>
.add-row {
  padding: 0.5rem 0;
  justify-content: flex-end;
}
.add-row.root {
  margin-right: 1rem;
}
</style>
