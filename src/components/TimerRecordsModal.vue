<script setup lang="ts">
import { computed, ref } from "vue";
import { useTimerStore } from "../timerStore";
import { now } from "../clock";
import {
  isSelfOrDescendant,
  timerOverlapsRange,
  toDatetimeLocal,
  fromDatetimeLocal,
} from "../helpers";
import ModalDialog from "./ModalDialog.vue";
import StartEnd from "./StartEnd.vue";
import Edit from "../assets/edit.svg";
import Trash from "../assets/trash.svg";
import type { fhtTimer } from "../types";

const store = useTimerStore();
const props = defineProps<{ id: string }>();

// A record contributes to this row's total either as one of the row's own (or a descendant's)
// positive sessions, or as a pause started on the row's tag or an ancestor of it - both are
// exactly the two cases getRecordsInRange/getTimeInRange fold into this row's displayed time.
const records = computed(() =>
  store.timers
    .filter((t) => timerOverlapsRange(t, store.reportDayStart, store.reportDayEnd, now.value))
    .filter(
      (t) =>
        (t.positive && isSelfOrDescendant(t.id, props.id)) ||
        (!t.positive && isSelfOrDescendant(props.id, t.id)),
    )
    .sort((a, b) => a.start - b.start),
);

const crumbParts = (id: string) => id.split("//").filter((part) => part);

const editingUuid = ref<string | null>(null);
const deletingUuid = ref<string | null>(null);
const startInput = ref("");
const endInput = ref("");
const descriptionInput = ref("");

const editingTimer = computed(() => store.timers.find((t) => t.uuid === editingUuid.value));

const editError = computed(() => {
  const timer = editingTimer.value;
  if (!timer || timer.end === 0) {
    return "";
  }
  if (!startInput.value || !endInput.value) {
    return "Start and end are required.";
  }
  if (fromDatetimeLocal(endInput.value) <= fromDatetimeLocal(startInput.value)) {
    return "End must be after start.";
  }
  return "";
});

const modalTitle = computed(() => {
  if (editingTimer.value) {
    return "Edit record";
  }
  if (deletingUuid.value) {
    return "Delete record?";
  }
  return "Timer records";
});

const startEdit = (timer: fhtTimer) => {
  editingUuid.value = timer.uuid;
  startInput.value = toDatetimeLocal(timer.start);
  endInput.value = timer.end > 0 ? toDatetimeLocal(timer.end) : "";
  descriptionInput.value = timer.description;
};

const cancelEdit = () => {
  editingUuid.value = null;
};

const submitEdit = () => {
  const timer = editingTimer.value;
  if (!timer || editError.value) {
    return;
  }
  store.updateTimer(timer.uuid, {
    start: fromDatetimeLocal(startInput.value),
    end: timer.end === 0 ? 0 : fromDatetimeLocal(endInput.value),
    description: descriptionInput.value,
    positive: timer.positive,
  });
  editingUuid.value = null;
};

const confirmDelete = () => {
  if (!deletingUuid.value) {
    return;
  }
  store.removeTimer(deletingUuid.value);
  deletingUuid.value = null;
};
</script>

<template>
  <ModalDialog :title="modalTitle">
    <form v-if="editingTimer" class="add-form" @submit.prevent="submitEdit">
      <label>
        Start
        <input type="datetime-local" step="1" v-model="startInput" required />
      </label>
      <label v-if="editingTimer.end > 0">
        End
        <input type="datetime-local" step="1" v-model="endInput" required />
      </label>
      <p v-else class="running-note">Still running — stop it from the tag card instead.</p>
      <label>
        Description
        <textarea v-model="descriptionInput" placeholder="Description"></textarea>
      </label>
      <p class="error" v-if="editError">{{ editError }}</p>
      <div class="modal-buttons">
        <button type="button" @click="cancelEdit">Cancel</button>
        <button type="submit" :disabled="!!editError">Save</button>
      </div>
    </form>

    <template v-else-if="deletingUuid">
      <p>Delete this timer record? This can't be undone.</p>
      <div class="modal-buttons">
        <button @click="deletingUuid = null">Cancel</button>
        <button @click="confirmDelete">Delete</button>
      </div>
    </template>

    <template v-else>
      <div class="records-list" v-if="records.length">
        <div
          class="record"
          v-for="record in records"
          :key="record.uuid"
          :class="{ foreign: record.id !== props.id }"
        >
          <div class="record-info">
            <span class="crumb" v-if="record.id !== props.id">
              <span class="crumb-part" v-for="(part, i) in crumbParts(record.id)" :key="part">
                <span class="separator" v-if="i > 0">›</span>{{ part }}
              </span>
            </span>
            <span class="tag pause-tag" v-if="!record.positive">Pause</span>
            <StartEnd :start="record.start" :end="record.end" />
            <span class="tag running-tag" v-if="record.end === 0">Running</span>
            <p class="description" v-if="record.description">{{ record.description }}</p>
          </div>
          <div class="record-actions icons" v-if="record.id === props.id">
            <Edit class="icon clickable" title="Edit" @click="startEdit(record)" />
            <Trash class="icon clickable" title="Delete" @click="deletingUuid = record.uuid" />
          </div>
        </div>
      </div>
      <p class="empty" v-else>No timer records for this day.</p>
      <div class="modal-buttons">
        <button @click="store.closeModal()">Close</button>
      </div>
    </template>
  </ModalDialog>
</template>

<style scoped>
.records-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  max-height: 60vh;
  overflow-y: auto;
}
.record {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--fht-element-border-color);

  &:last-child {
    border-bottom: none;
  }

  &.foreign {
    opacity: 0.55;
  }
}
.record-info {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
}
.crumb {
  font-size: 0.85rem;
  opacity: 0.8;
}
.separator {
  opacity: 0.5;
  margin: 0 0.2ch;
}
.tag {
  display: inline-block;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  opacity: 0.7;
  width: fit-content;
}
.description {
  opacity: 0.8;
  font-size: 0.9rem;
}
.record-actions {
  flex: none;
}
.empty {
  opacity: 0.6;
  text-align: center;
  padding: 1rem;
}
.add-form {
  padding: 1rem;

  & > * {
    width: 100%;
    margin: 0.25rem auto;
    display: block;
  }

  & label {
    font-size: 0.85rem;
    opacity: 0.8;
  }

  & input,
  & textarea {
    margin-top: 0.2rem;
  }
}
.running-note {
  opacity: 0.7;
  font-size: 0.9rem;
}
.error {
  color: #e05252;
  font-size: 0.85rem;
}
</style>
