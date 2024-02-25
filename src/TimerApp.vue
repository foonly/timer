<script setup lang="ts">
import { useTimerStore } from "./timerStore";
import Tags from "./components/Tags.vue";

const store = useTimerStore();
store.tags = [
  { name: "root", parent: "", description: "Root tag" },
  { name: "project", parent: "//root", description: "Test Project" },
  { name: "task 1", parent: "//root//project", description: "First task" },
  { name: "task 2", parent: "//root//project", description: "Second task" },
  { name: "project 2", parent: "//root", description: "Test Project" },
  { name: "task 1", parent: "//root//project 2", description: "First task" },
  { name: "task 2", parent: "//root//project 2", description: "Second task" },
  { name: "foo", parent: "", description: "Root tag" },
  { name: "project", parent: "//foo", description: "Test Project" },
  { name: "task 1", parent: "//foo//project", description: "First task" },
  { name: "task 2", parent: "//foo//project", description: "Second task" },
];
</script>

<template>
  <div>Foobar</div>
  <section class="tags">
    <Tags parent="" />
  </section>
  <button class="" v-on:click="store.count++">Count {{ store.count }}</button>
</template>

<style scoped>
.tags {
  padding: 1rem;
  max-width: 300px;
}
button {
  border: 2px solid rgb(60, 60, 60);
  border-radius: 8px;
}
</style>
