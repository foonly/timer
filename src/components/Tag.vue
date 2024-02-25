<script setup lang="ts">
import type { fhtTag } from "../types";

defineProps<{ tag: fhtTag }>();
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
  border: 1px solid var(--fht-element-border-color);
  border-radius: 0.5rem;
  background-color: var(--fht-element-background-color);
  padding: 8px;

  &:hover {
    background-color: rgba(60, 60, 60, 0.8);
  }
}
</style>
