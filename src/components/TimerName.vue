<script setup lang="ts">
import type { timerStatus } from "../types";
import StatusDot from "./StatusDot.vue";

defineProps<{ name: string; status: timerStatus }>();
</script>

<template>
  <h2>
    <StatusDot :status="status" />
    <span class="name-part" v-for="part in name.split('//').filter((e) => e)" :key="part">{{
      part
    }}</span>
  </h2>
</template>

<style scoped>
h2 {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.3ch;

  & .name-part {
    display: inline-block;
    background-color: var(--fht-element-background-color);
    border-radius: var(--fht-border-radius);
    padding: 0.3ch 0.6ch;
    margin: 0.3ch;
  }
}
</style>
