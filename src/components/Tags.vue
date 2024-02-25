<script setup lang="ts">
import { useTimerStore } from "../timerStore";
import Tag from "./Tag.vue";
import Modal from "./Modal.vue";
import { ref } from "vue";
import { tagSchema } from "../types";

const store = useTimerStore();
const props = defineProps<{ parent: string }>();
const name = ref("");
const description = ref("");

const modalName = (id: string, name?: string) => {
  return `${id}:${props.parent}${name ? `//${name}` : ""}`;
};
const tagName = (id: string) => {
  return id.split("//").at(-1);
};
const addTag = () => {
  const tag = tagSchema.parse({
    parent: props.parent,
    name: name.value,
    description: description.value,
  });
  store.tags.push(tag);
  name.value = "";
  description.value = "";
  store.modal = "";
};
</script>

<template>
  <Tag v-for="tag in store.getTags(props.parent)" :tag="tag">
    <button
      class="add-tag"
      @click="store.modal = modalName('add-tag', tag.name)"
    >
      Add Tag
    </button>
    <button
      class="remove-tag"
      @click="store.modal = modalName('remove-tag', tag.name)"
    >
      Remove Tag
    </button>
    <Tags :parent="tag.parent + '//' + tag.name" />
  </Tag>
  <Modal
    v-if="store.modal === modalName('add-tag')"
    :title="`Add tag under ${tagName(props.parent)}`"
  >
    <div class="add-form">
      <input class="name" type="text" v-model="name" placeholder="Name" />
      <textarea
        class="description"
        v-model="description"
        placeholder="Description"
      ></textarea>
    </div>
    <div class="modal-buttons">
      <button @click="store.modal = ''">Cancel</button>
      <button @click="addTag">Add</button>
    </div>
  </Modal>
  <Modal v-if="store.modal === modalName('remove-tag')" title="Are you sure?">
    <p>Remove tag "{{ tagName(props.parent) }}" and all it's sub-tags?</p>
    <div class="modal-buttons">
      <button @click="store.modal = ''">Cancel</button>
      <button @click="store.removeTag(props.parent)">Remove</button>
    </div>
  </Modal>
</template>

<style scoped>
.add-form {
  padding: 1rem;
  & > * {
    width: 100%;
    margin: 0.25rem auto;
    display: block;
  }
}
</style>
