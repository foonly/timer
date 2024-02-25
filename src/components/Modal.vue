<script setup lang="ts">
import { useTimerStore } from "../timerStore";

defineProps<{ title?: string }>();
const store = useTimerStore();
</script>

<template>
  <div class="modal-background" @click="store.modal = ''">
    <div class="modal" @click.stop>
      <h2 v-if="title">{{ title }}</h2>
      <slot></slot>
    </div>
  </div>
</template>

<style scoped>
.modal-background {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  align-content: center;
  justify-content: center;

  .modal {
    min-width: 400px;
    min-height: 400px;
    background-color: antiquewhite;
    border-radius: var(--fht-border-radius);
    background-color: var(--fht-element-background-color);
    border: 2px solid var(--fht-element-border-color);

    h2 {
      margin-top: 0;
      border-top-left-radius: var(--fht-border-radius);
      border-top-right-radius: var(--fht-border-radius);
      background-color: rgba(10, 10, 10, 0.5);
      padding: 0.5rem 1rem;
      margin-bottom: 0;
    }
  }
}
</style>
