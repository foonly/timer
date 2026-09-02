<script setup lang="ts">
defineProps<{ label: string; disabled?: boolean; size?: "default" | "small" }>();
</script>

<template>
  <button
    type="button"
    class="icon-button"
    :class="size"
    :aria-label="label"
    :title="label"
    :disabled="disabled"
  >
    <slot></slot>
  </button>
</template>

<style scoped>
.icon-button {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: var(--fht-touch-target);
  height: var(--fht-touch-target);
  padding: 0;
  background-color: transparent;
  border: 1px solid transparent;
  border-radius: var(--fht-button-border-radius);
  opacity: 0.75;
  transition:
    background-color 0.15s ease,
    opacity 0.15s ease;

  &.small {
    width: 32px;
    height: 32px;
  }

  &:hover {
    opacity: 1;
    background-color: var(--fht-element-border-color);
  }

  &:active {
    opacity: 1;
    transform: scale(0.94);
  }

  &:disabled {
    opacity: 0.3;
    cursor: default;
    background-color: transparent;
    transform: none;
  }
}
</style>
