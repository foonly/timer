<script setup lang="ts">
import { computed } from "vue";
import { VueDraggable, type DraggableEvent } from "vue-draggable-plus";
import { useTimerStore } from "../timerStore";
import TagItem from "./TagItem.vue";
import EditTag from "./EditTag.vue";
import { tagName } from "../helpers";

const store = useTimerStore();
const props = defineProps<{ parent: string }>();

// VueDraggable needs a bound array to drive its own drag mechanics, but store.getTags(parent)
// (sorted by `order`) stays the single source of truth: onDragEnd below persists only the moved
// tag's new parent/order via store.moveTag, and this getter reflects the canonical list again
// right after, so nothing here is written back to.
const tags = computed(() => store.getTags(props.parent));

const onDragEnd = (event: DraggableEvent) => {
  const tagId = event.item.dataset.tagId;
  const newParent = event.to.dataset.parent;
  if (!tagId || newParent === undefined || event.newIndex === undefined) {
    return;
  }
  store.moveTag(tagId, newParent, event.newIndex);
};
</script>

<template>
  <div class="tags-level">
    <VueDraggable
      :model-value="tags"
      tag="div"
      class="tags-list"
      group="tags"
      handle=".drag-handle"
      :animation="150"
      item-key="uuid"
      :data-parent="props.parent"
      @end="onDragEnd"
    >
      <TagItem v-for="tag in tags" :tag="tag" :key="tag.uuid">
        <ListTags :parent="tag.parent + '//' + tag.name" />
      </TagItem>
    </VueDraggable>

    <EditTag
      v-if="store.isModal('add-tag', props.parent)"
      :parent="props.parent"
      :title="`Add tag ${props.parent ? `under ${tagName(props.parent)}` : 'to root'}`"
    />
  </div>
</template>

<style scoped>
.tags-list:empty {
  min-height: 0.75rem;
}
</style>
