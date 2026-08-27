<script setup lang="ts">
import { useTimerStore } from "../timerStore";
import Play from "../assets/play.svg";
import Plus from "../assets/plus.svg";

const store = useTimerStore();
const props = defineProps<{ parent: string }>();
</script>

<template>
  <span
    class="quick-start clickable"
    title="Add a random tag and start it"
    @click="store.quickStartTag(props.parent)"
  >
    <Play class="icon" />
    <Plus class="badge" />
  </span>
</template>

<style scoped>
.quick-start {
  display: inline-flex;
  align-items: center;
}
.badge {
  width: 0.85rem;
  height: 0.85rem;
  margin-left: 0.15rem;
  fill: currentColor;
}
</style>
