<script setup lang="ts">
import { onMounted, onUnmounted, ref, useId } from "vue";
import { useTimerStore } from "../timerStore";
import Plus from "../assets/plus.svg";
import IconButton from "./IconButton.vue";

defineProps<{ title?: string }>();
const store = useTimerStore();

const titleId = useId();
const modalRef = ref<HTMLElement | null>(null);
let previouslyFocused: HTMLElement | null = null;

const focusableSelector =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusable(container: HTMLElement | null): HTMLElement[] {
  if (!container) {
    return [];
  }
  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector));
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    store.closeModal();
    return;
  }
  if (event.key !== "Tab") {
    return;
  }
  const focusable = getFocusable(modalRef.value);
  if (focusable.length === 0) {
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

onMounted(() => {
  previouslyFocused = document.activeElement as HTMLElement | null;
  window.addEventListener("keydown", onKeydown);
  const bodyFocusable = getFocusable(
    modalRef.value?.querySelector<HTMLElement>(".modal-body") ?? null,
  );
  (bodyFocusable[0] ?? getFocusable(modalRef.value)[0])?.focus();
});

onUnmounted(() => {
  window.removeEventListener("keydown", onKeydown);
  previouslyFocused?.focus();
});
</script>

<template>
  <div class="modal-background" @click="store.modal = ''">
    <div
      class="modal"
      ref="modalRef"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="title ? titleId : undefined"
      @click.stop
    >
      <header class="modal-header" :class="{ untitled: !title }">
        <h2 v-if="title" :id="titleId">{{ title }}</h2>
        <IconButton label="Close" class="close-button" @click="store.closeModal()">
          <Plus class="icon" />
        </IconButton>
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
      padding: 0.6rem 0.6rem 0.6rem 1.25rem;
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

.close-button :deep(.icon) {
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
