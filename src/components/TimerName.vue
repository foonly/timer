<script setup lang="ts">
defineProps<{ name: string }>();
</script>

<template>
  <h2>
    <span v-for="part in name.split('//').filter((e) => e)" :key="part">{{ part }}</span>
  </h2>
</template>

<style scoped>
h2 {
  & span {
    display: inline-block;
    background-color: var(--fht-element-background-color);
    border-radius: var(--fht-border-radius);
    padding: 0.3ch 0.6ch;
    margin: 0.3ch;
  }
}
</style>
