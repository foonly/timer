<script setup lang="ts">
import { useTimerStore } from "../timerStore";
import ModalDialog from "./ModalDialog.vue";
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
    store.updateTag(props.id, {
      name: name.value,
      parent: existingTag.value.parent,
      description: description.value,
    });
  } else {
    store.addTag(props.parent, name.value, description.value);
  }
  resetForm();
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
