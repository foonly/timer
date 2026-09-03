<script setup lang="ts">
import type { fhtTag } from "../types";
import { onUnmounted, ref, watch } from "vue";
import { useTimerStore } from "../timerStore";
import Dots from "../assets/dots-vertical.svg";
import Trash from "../assets/trash.svg";
import Edit from "../assets/edit.svg";
import Plus from "../assets/plus.svg";
import PlayArrow from "../assets/play-arrow.svg";
import IconButton from "./IconButton.vue";

const store = useTimerStore();
const props = defineProps<{ tag: fhtTag; id: string }>();

const open = ref(false);
const rootRef = ref<HTMLElement | null>(null);

const close = () => {
  open.value = false;
  rootRef.value?.querySelector("button")?.focus();
};
const toggle = () => {
  open.value = !open.value;
};

const onMousedown = (event: MouseEvent) => {
  if (!rootRef.value?.contains(event.target as Node)) {
    open.value = false;
  }
};
const onKeydown = (event: KeyboardEvent) => {
  if (event.key === "Escape") {
    close();
  }
};

watch(open, (isOpen) => {
  if (isOpen) {
    window.addEventListener("mousedown", onMousedown);
    window.addEventListener("keydown", onKeydown);
  } else {
    window.removeEventListener("mousedown", onMousedown);
    window.removeEventListener("keydown", onKeydown);
  }
});
onUnmounted(() => {
  window.removeEventListener("mousedown", onMousedown);
  window.removeEventListener("keydown", onKeydown);
});

const removeTag = () => {
  close();
  store.openModal("remove-tag", props.tag.parent, props.tag.name);
};
const editTag = () => {
  close();
  store.openModal("edit-tag", props.tag.parent, props.tag.name);
};
const addTag = () => {
  close();
  store.openModal("add-tag", props.id);
};
const quickStart = () => {
  close();
  store.quickStartTag(props.id);
};
</script>

<template>
  <div class="tag-actions-menu" ref="rootRef">
    <IconButton label="Tag actions" size="small" :aria-expanded="open" @click="toggle">
      <Dots class="icon" />
    </IconButton>
    <div v-if="open" class="menu-panel" role="menu" @click.stop>
      <button type="button" class="menu-item" role="menuitem" @click="editTag">
        <Edit class="icon" />
        Edit tag
      </button>
      <button type="button" class="menu-item" role="menuitem" @click="addTag">
        <Plus class="icon" />
        Add sub-tag
      </button>
      <button type="button" class="menu-item" role="menuitem" @click="quickStart">
        <PlayArrow class="icon" />
        Quick start
      </button>
      <button type="button" class="menu-item destructive" role="menuitem" @click="removeTag">
        <Trash class="icon" />
        Remove tag
      </button>
    </div>
  </div>
</template>

<style scoped>
.tag-actions-menu {
  position: relative;
  display: flex;
  justify-content: flex-end;
  flex: none;
}
.menu-panel {
  position: absolute;
  top: calc(100% + 0.25rem);
  right: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 10rem;
  padding: 0.3rem;
  border-radius: var(--fht-border-radius);
  background-color: var(--fht-element-background-color);
  border: 1px solid var(--fht-element-border-color);
  box-shadow: 3px 3px 12px rgba(0, 0, 0, 0.3);
  animation: menu-pop-in 0.15s ease-out;
}
.menu-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  padding: 0.5rem 0.6rem;
  border-radius: var(--fht-button-border-radius);
  background-color: transparent;
  border: none;
  font-weight: normal;
  font-size: 0.9rem;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.15s ease;

  &:hover {
    background-color: var(--fht-element-border-color);
  }

  & .icon {
    flex: none;
    width: 16px;
    height: 16px;
  }

  &.destructive {
    color: var(--fht-error-color);
  }
}

@keyframes menu-pop-in {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(-4px);
  }
}
</style>
