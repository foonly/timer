<script setup lang="ts">
import { useTimerStore } from "../timerStore";
import { tagSchema } from "../types";
import ModalDialog from "./ModalDialog.vue";
import { ref } from "vue";

const store = useTimerStore();
const props = defineProps<{ title: string; parent: string; id?: string }>();
const name = ref("");
const description = ref("");

const submitted = () => {
  const tag = tagSchema.parse({
    parent: props.parent,
    name: name.value,
    description: description.value,
  });
  store.tags.push(tag);
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
        <button type="submit">Add</button>
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
