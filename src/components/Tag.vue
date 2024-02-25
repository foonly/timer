<script setup lang="ts">
import type { timerTag } from "../types";

defineProps<{ tag: timerTag }>();
</script>

<template>
  <div class="tag">
    <h2>{{ tag.name }}</h2>
    <p>{{ tag.description }}</p>
    <slot></slot>
  </div>
</template>

<style scoped>
.tag {
  margin-top: 0.5rem;
  border: 1px solid rgba(30, 30, 30, 0.6);
  border-radius: 0.5rem;
  background-color: rgba(60, 60, 60, 0.6);
  padding: 8px;

  &:hover {
    background-color: rgba(60, 60, 60, 0.8);
  }
}
</style>
