<script setup lang="ts">
import { formatClockTime } from "../helpers";

const props = defineProps<{ start: number; end: number }>();
</script>

<template>
  <div class="start-end">
    <time class="start" :datetime="new Date(props.start).toISOString()">
      {{ formatClockTime(props.start) }}
    </time>
    <time class="end" v-if="props.end > 0" :datetime="new Date(props.end).toISOString()">
      {{ formatClockTime(props.end) }}
    </time>
  </div>
</template>

<style scoped>
.start-end {
  display: flex;
  gap: 1rem;
}
</style>
