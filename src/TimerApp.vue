<script setup lang="ts">
import { useTimerStore } from "./timerStore";
import Tags from "./components/Tags.vue";

const store = useTimerStore();
</script>

<template>
  <h1>Foonlys Hierarchical Timer</h1>
  <section class="tags">
    <button class="add-tag" @click="store.modal = 'add-tag:'">Add Tag</button>
    <Tags parent="" />
  </section>
</template>

<style scoped>
h1 {
  text-align: center;
}
.tags {
  padding: 1rem;
  max-width: 500px;
}
button {
  border: 2px solid rgb(60, 60, 60);
  border-radius: 8px;
}
</style>
