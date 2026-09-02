<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ id: string; highlightLast?: boolean }>();

const parts = computed(() => props.id.split("//").filter((part) => part));
</script>

<template>
  <span class="tag-path">
    <span class="crumb" v-for="(part, i) in parts" :key="i">
      <span class="separator" v-if="i > 0">›</span>
      <span
        class="name-part"
        :class="{
          dim: highlightLast && i !== parts.length - 1,
          active: highlightLast && i === parts.length - 1,
        }"
        >{{ part }}</span
      >
    </span>
  </span>
</template>

<style scoped>
.tag-path {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.3ch;
  min-width: 0;
}
.crumb {
  display: inline-flex;
  align-items: center;
  gap: 0.3ch;
}
.separator {
  opacity: 0.35;
}
.name-part {
  &.dim {
    opacity: 0.55;
  }
  &.active {
    opacity: 1;
    font-weight: 600;
  }
}
</style>
