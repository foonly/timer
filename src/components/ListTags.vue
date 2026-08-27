<script setup lang="ts">
import { useTimerStore } from "../timerStore";
import TagItem from "./TagItem.vue";
import EditTag from "./EditTag.vue";
import QuickStartButton from "./QuickStartButton.vue";
import { tagName } from "../helpers";
import Plus from "../assets/plus.svg";

const store = useTimerStore();
const props = defineProps<{ parent: string }>();
</script>

<template>
  <div id="tags">
    <TagItem v-for="tag in store.getTags(props.parent)" :tag="tag" :key="tag.name">
      <ListTags :parent="tag.parent + '//' + tag.name" />
      <div class="icons">
        <Plus
          class="icon clickable"
          title="Add tag"
          @click="store.openModal('add-tag', tag.parent, tag.name)"
        />
        <QuickStartButton :parent="tag.parent + '//' + tag.name" />
      </div>
    </TagItem>

    <EditTag
      v-if="store.isModal('add-tag', props.parent)"
      :parent="props.parent"
      :title="`Add tag ${props.parent ? `under ${tagName(props.parent)}` : 'to root'}`"
    />
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

  .name {
    font-size: 1.4em;
  }
}
</style>
