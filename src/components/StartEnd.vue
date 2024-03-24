<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ start: number; end: number }>();

const startDate = computed(() => {
  const date = new Date(props.start);

  return date;
});
const endDate = computed(() => {
  const date = new Date(props.end);

  return date;
});
</script>

<template>
  <div class="start-end">
    <time class="start" :datetime="startDate.toISOString()">
      {{ startDate.getHours() }}:{{ startDate.getMinutes() }}:{{ startDate.getSeconds() }}
    </time>
    <time class="end" v-if="props.end > 0" :datetime="endDate.toISOString()">
      {{ endDate.getHours() }}:{{ endDate.getMinutes() }}:{{ endDate.getSeconds() }}
    </time>
  </div>
</template>
