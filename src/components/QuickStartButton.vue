<script setup lang="ts">
import { useTimerStore } from "../timerStore";
import PlayArrow from "../assets/play-arrow.svg";
import Plus from "../assets/plus.svg";
import IconButton from "./IconButton.vue";

const store = useTimerStore();
const props = defineProps<{ parent: string; size?: "default" | "small" }>();
</script>

<template>
  <IconButton
    label="Add a random tag and start it"
    :size="size"
    @click="store.quickStartTag(props.parent)"
  >
    <span class="quick-start" :class="{ small: size === 'small' }">
      <PlayArrow class="arrow" />
      <Plus class="badge" />
    </span>
  </IconButton>
</template>

<style scoped>
.quick-start {
  position: relative;
  display: inline-block;
  width: 24px;
  height: 24px;

  &.small {
    width: 18px;
    height: 18px;
  }
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

  .quick-start.small & {
    top: -0.1rem;
    right: -0.1rem;
    width: 0.55rem;
    height: 0.55rem;
  }
}
</style>
