<script setup lang="ts">
import { useTimerStore } from "../timerStore";
import Tag from "./Tag.vue";

const store = useTimerStore();
const props = defineProps<{ parent: string }>();
console.debug(props);
</script>

<template>
  <Tag v-for="tag in store.getTags(props.parent)" :tag="tag">
    <Tags :parent="tag.parent + '//' + tag.name" />
  </Tag>
</template>

<style scoped></style>
