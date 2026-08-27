<script setup lang="ts">
import { useTimerStore } from "../timerStore";
import ModalDialog from "./ModalDialog.vue";
import { isSelfOrDescendant } from "../helpers";
import { computed, ref } from "vue";

const store = useTimerStore();
const props = defineProps<{ title: string; parent: string; id?: string }>();

const existingTag = computed(() => {
  return store.tags.find((tag) => `${tag.parent}//${tag.name}` === props.id);
});

const name = ref(existingTag.value?.name ?? "");
const description = ref(existingTag.value?.description ?? "");

const submitted = () => {
  if (props.id && existingTag.value) {
    updateTag(props.id, existingTag.value);
  } else {
    store.addTag(props.parent, name.value, description.value);
  }
  resetForm();
};

const updateTag = (oldId: string, tag: { name: string; parent: string; description: string }) => {
  const newId = `${tag.parent}//${name.value}`;
  tag.name = name.value;
  tag.description = description.value;

  if (newId === oldId) {
    return;
  }

  for (const other of store.tags) {
    if (other.parent === oldId) {
      other.parent = newId;
    }
  }
  for (const timer of store.timers) {
    if (timer.id === oldId) {
      timer.id = newId;
    } else if (isSelfOrDescendant(timer.id, oldId)) {
      timer.id = newId + timer.id.slice(oldId.length);
    }
  }
};

const resetForm = () => {
  name.value = "";
  description.value = "";
  store.modal = "";
};
</script>

<template>
  <ModalDialog :title="props.title">
    <form @submit="submitted">
      <div class="add-form">
        <input class="name" type="text" v-model="name" placeholder="Name" v-focus />
        <textarea class="description" v-model="description" placeholder="Description"></textarea>
      </div>
      <div class="modal-buttons">
        <button type="reset" @click="resetForm">Cancel</button>
        <button type="submit">{{ props.id ? "Save" : "Add" }}</button>
      </div>
    </form>
  </ModalDialog>
</template>

<style scoped>
.add-form {
  padding: 1rem;
  & > * {
    width: 100%;
    margin: 0.25rem auto;
    display: block;
  }

  .name {
    font-size: 1.4em;
  }
}
</style>
