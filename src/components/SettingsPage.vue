<script setup lang="ts">
import ModalDialog from "./ModalDialog.vue";
import { version } from "../../package.json";
</script>

<template>
  <ModalDialog title="Settings">
    <p class="placeholder">Nothing to configure yet.</p>
    <p class="version">Version {{ version }}</p>
  </ModalDialog>
</template>

<style scoped>
.placeholder,
.version {
  padding: 0 1rem;
}
.version {
  opacity: 0.5;
}
</style>
