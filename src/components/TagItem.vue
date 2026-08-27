<script setup lang="ts">
import type { fhtTag } from "../types";
import Trash from "../assets/trash.svg";
import Edit from "../assets/edit.svg";
import Play from "../assets/play.svg";
import Stop from "../assets/stop.svg";
import Pause from "../assets/pause.svg";
import { useTimerStore } from "../timerStore";
import ModalDialog from "./ModalDialog.vue";
import TimeDisplay from "./TimeDisplay.vue";
import EditTag from "./EditTag.vue";
import StatusDot from "./StatusDot.vue";
import { computed } from "vue";

const store = useTimerStore();

const props = defineProps<{ tag: fhtTag }>();

const id = `${props.tag.parent}//${props.tag.name}`;
const status = computed(() => store.getStatus(id));
</script>

<template>
  <div class="tag card" :data-status="status">
    <header>
      <h2><StatusDot :status="status" />{{ tag.name }}</h2>
      <section class="actions icons">
        <Trash
          class="icon clickable"
          @click="store.openModal('remove-tag', tag.parent, tag.name)"
        />
        <Edit class="icon clickable" @click="store.openModal('edit-tag', tag.parent, tag.name)" />
      </section>
    </header>
    <p>{{ tag.description }}</p>
    <div class="time-row">
      <section class="controls icons">
        <Play
          class="icon clickable"
          title="Start"
          @click="store.startTimer(id)"
          v-if="!store.isRunning(id)"
        />
        <template v-else>
          <Stop class="icon clickable" title="Stop" @click="store.stopTimer(id)" />
          <Play
            v-if="status === 'paused'"
            class="icon clickable"
            title="Resume"
            @click="store.resumeTimer(id)"
          />
          <Pause v-else class="icon clickable" title="Pause" @click="store.startTimer(id, false)" />
        </template>
      </section>
      <TimeDisplay class="tag-time" :time="store.getTime(id)" />
    </div>
    <div class="nested"><slot></slot></div>

    <ModalDialog v-if="store.isModal('remove-tag', tag.parent, tag.name)" title="Are you sure?">
      <p>Remove tag "{{ tag.name }}" and all it's sub-tags?</p>
      <div class="modal-buttons">
        <button @click="store.modal = ''">Cancel</button>
        <button @click="store.removeTag(`${tag.parent}//${tag.name}`)">Remove</button>
      </div>
    </ModalDialog>
    <EditTag
      v-if="store.isModal('edit-tag', tag.parent, tag.name)"
      :id="id"
      :parent="tag.parent"
      title="Edit Tag"
    />
  </div>
</template>

<style scoped>
header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}
h2 {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  min-width: 0;
  flex: 1;

  & .status-dot {
    margin-top: 0.45em;
  }
}
.actions {
  flex: none;
}
.time-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-top: 0.75rem;

  & .icon {
    width: 32px;
    height: 32px;
  }
}
.tag-time {
  font-size: 2.2rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.nested {
  margin-top: 1rem;
}
</style>
