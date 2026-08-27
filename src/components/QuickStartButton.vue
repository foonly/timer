<script setup lang="ts">
import { useTimerStore } from "../timerStore";
import PlayArrow from "../assets/play-arrow.svg";
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
    <PlayArrow class="arrow" />
    <Plus class="badge" />
  </span>
</template>

<style scoped>
.quick-start {
  position: relative;
  display: inline-block;
  width: 24px;
  height: 24px;
}
.arrow {
  width: 100%;
  height: 100%;
  fill: currentColor;
}
.badge {
  position: absolute;
  top: -0.15rem;
  right: -0.15rem;
  width: 0.7rem;
  height: 0.7rem;
  fill: currentColor;
}
</style>
