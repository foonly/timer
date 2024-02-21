<script setup lang="ts">
import { useTimerStore } from "./timerStore";
import Tag from "./components/Tag.vue";

const store = useTimerStore();
store.tags.push({ name: "foobar", description: "Hello" });

console.debug(store.tags);
</script>

<template>
  <div>Foo</div>
  <Tag v-for="tag in store.tags" :tag="tag"></Tag>
  <button v-on:click="store.count++">Count {{ store.count }}</button>
</template>

<style scoped>
.logo {
  height: 6em;
  padding: 1.5em;
  will-change: filter;
  transition: filter 300ms;
}
.logo:hover {
  filter: drop-shadow(0 0 2em #646cffaa);
}
.logo.vue:hover {
  filter: drop-shadow(0 0 2em #42b883aa);
}
</style>
