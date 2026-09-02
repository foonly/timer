<script setup lang="ts">
import { useTimerStore } from "../timerStore";
import { isSelfOrDescendant } from "../helpers";
import ModalDialog from "./ModalDialog.vue";
import { computed, ref } from "vue";

const store = useTimerStore();
const props = defineProps<{ title: string; parent: string; id?: string }>();

const existingTag = computed(() => {
  return store.tags.find((tag) => `${tag.parent}//${tag.name}` === props.id);
});

const name = ref(existingTag.value?.name ?? "");
const description = ref(existingTag.value?.description ?? "");
const selectedParent = ref(existingTag.value?.parent ?? "");

// Keyboard-operable equivalent of drag-to-reparent: every tag except the one being edited and its
// own descendants (dropping into either would create a cycle - same guard store.moveTag uses).
const parentOptions = computed(() => {
  if (!props.id) {
    return [];
  }
  return store.tags
    .filter((tag) => !isSelfOrDescendant(`${tag.parent}//${tag.name}`, props.id!))
    .map((tag) => {
      const path = `${tag.parent}//${tag.name}`;
      return { id: path, label: path.split("//").filter(Boolean).join(" › ") };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
});

const submitted = () => {
  if (props.id && existingTag.value) {
    const order =
      selectedParent.value === existingTag.value.parent
        ? existingTag.value.order
        : store.nextOrderAfter(selectedParent.value);
    store.updateTag(props.id, {
      name: name.value,
      parent: selectedParent.value,
      description: description.value,
      order,
    });
  } else {
    store.addTag(props.parent, name.value, description.value);
  }
  resetForm();
};

const resetForm = () => {
  name.value = "";
  description.value = "";
  selectedParent.value = existingTag.value?.parent ?? "";
  store.modal = "";
};
</script>

<template>
  <ModalDialog :title="props.title">
    <form @submit="submitted">
      <div class="form-stack">
        <label class="name-field">
          Name
          <input type="text" v-model="name" placeholder="Name" v-focus />
        </label>
        <label v-if="props.id">
          Parent
          <select v-model="selectedParent">
            <option value="">Root</option>
            <option v-for="opt in parentOptions" :key="opt.id" :value="opt.id">
              {{ opt.label }}
            </option>
          </select>
        </label>
        <label>
          Description
          <textarea v-model="description" placeholder="Description"></textarea>
        </label>
      </div>
      <div class="modal-buttons">
        <button type="reset" class="btn-secondary" @click="resetForm">Cancel</button>
        <button type="submit" class="btn-primary">{{ props.id ? "Save" : "Add" }}</button>
      </div>
    </form>
  </ModalDialog>
</template>

<style scoped>
.form-stack {
  & label {
    font-size: 0.85rem;
    opacity: 0.8;
  }

  & input,
  & textarea {
    margin-top: 0.2rem;
  }

  & .name-field input {
    font-size: 1.4em;
  }
}
</style>
