<script setup lang="ts">
import type { fhtTag } from "../types";
import Trash from "../assets/trash.svg";
import { useTimerStore } from "../timerStore";
import TimerModal from "./TimerModal.vue";

const store = useTimerStore();

defineProps<{ tag: fhtTag }>();
</script>

<template>
  <div class="tag">
    <Trash class="icon clickable" @click="store.openModal('remove-tag', tag.parent, tag.name)" />
    <h2>{{ tag.name }}</h2>
    <p>{{ tag.description }}</p>
    <slot></slot>

    <TimerModal v-if="store.isModal('remove-tag', tag.parent, tag.name)" title="Are you sure?">
      <p>Remove tag "{{ tag.name }}" and all it's sub-tags?</p>
      <div class="modal-buttons">
        <button @click="store.modal = ''">Cancel</button>
        <button @click="store.removeTag(`${tag.parent}//${tag.name}`)">Remove</button>
      </div>
    </TimerModal>
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
