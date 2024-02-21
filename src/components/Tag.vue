<script setup lang="ts">
import type { timerTag } from "../types";

defineProps<{ tag: timerTag }>();
</script>

<template>
  <div>{{ tag.name }}</div>
  <p>{{ tag.description }}</p>
</template>

<style scoped></style>
