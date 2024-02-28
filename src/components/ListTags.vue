<script setup lang="ts">
import { useTimerStore } from "../timerStore";
import TimerTag from "./TimerTag.vue";
import TimerModal from "./TimerModal.vue";
import { ref } from "vue";
import { tagName } from "../helpers";
import { tagSchema } from "../types";
import Plus from "../assets/plus.svg";

const store = useTimerStore();
const props = defineProps<{ parent: string }>();
const name = ref("");
const description = ref("");

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
  <div class="tags">
    <TimerTag v-for="tag in store.getTags(props.parent)" :tag="tag" :key="tag.name">
      <ListTags :parent="tag.parent + '//' + tag.name" />
      <Plus class="icon clickable" @click="store.openModal('add-tag', tag.parent, tag.name)" />
    </TimerTag>

    <TimerModal
      v-if="store.isModal('add-tag', props.parent)"
      :title="`Add tag ${props.parent ? `under ${tagName(props.parent)}` : 'to root'}`"
    >
      <div class="add-form">
        <input class="name" type="text" v-model="name" placeholder="Name" />
        <textarea class="description" v-model="description" placeholder="Description"></textarea>
      </div>
      <div class="modal-buttons">
        <button @click="store.modal = ''">Cancel</button>
        <button @click="addTag">Add</button>
      </div>
    </TimerModal>
  </div>
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
