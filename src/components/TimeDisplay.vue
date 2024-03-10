<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ time: number }>();

const timeParts = computed(() => {
  const seconds = Math.round(props.time / 1000);
  let output = "";

  if (seconds >= 86400) {
    const days = Math.floor(seconds / 86400);
    output += `${days} days `;
  }

  const hours = Math.floor(seconds / 3600);
  output += `${("0" + (hours % 24)).slice(-2)}:`;

  const minutes = Math.floor(seconds / 60);
  output += `${("0" + (minutes % 60)).slice(-2)}:`;

  output += ("0" + (seconds % 60)).slice(-2);

  return output;
});
</script>

<template>
  <time>
    {{ timeParts }}
  </time>
</template>

<style scoped></style>
