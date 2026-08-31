<script setup lang="ts">
import { useTimerStore } from "../timerStore";
import Plus from "../assets/plus.svg";

defineProps<{ title?: string }>();
const store = useTimerStore();
</script>

<template>
  <div class="modal-background" @click="store.modal = ''">
    <div class="modal" @click.stop>
      <header class="modal-header" :class="{ untitled: !title }">
        <h2 v-if="title">{{ title }}</h2>
        <Plus class="icon clickable close-button" title="Close" @click="store.closeModal()" />
      </header>
      <div class="modal-body">
        <slot></slot>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-background {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  z-index: 3;
  animation: modal-fade-in 0.15s ease-out;

  .modal {
    --modal-padding: 1.25rem;
    width: min(94vw, 30rem);
    max-height: min(88vh, 42rem);
    overflow-y: auto;
    border-radius: calc(var(--fht-border-radius) * 1.5);
    background-color: var(--fht-element-background-color);
    border: 1px solid var(--fht-element-border-color);
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6);
    padding: var(--modal-padding);
    animation: modal-pop-in 0.18s ease-out;

    .modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      margin: calc(var(--modal-padding) * -1) calc(var(--modal-padding) * -1) 1rem;
      padding: 0.9rem 1.25rem;
      border-top-left-radius: calc(var(--fht-border-radius) * 1.5);
      border-top-right-radius: calc(var(--fht-border-radius) * 1.5);
      background-color: rgba(10, 10, 10, 0.35);

      &.untitled {
        justify-content: flex-end;
        background-color: transparent;
        margin-bottom: 0;
        padding: 0.6rem 0.6rem 0 0;
      }

      h2 {
        margin: 0;
      }
    }
  }
}

.icon.close-button {
  flex: none;
  width: 18px;
  height: 18px;
  transform: rotate(45deg);
}

@keyframes modal-fade-in {
  from {
    opacity: 0;
  }
}

@keyframes modal-pop-in {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(6px);
  }
}
</style>
