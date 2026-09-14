<script setup lang="ts">
import { useTimerStore } from "../timerStore";
import ModalDialog from "./ModalDialog.vue";

const store = useTimerStore();

const dismiss = () => {
  store.wizardPromptDismissed = true;
  store.closeModal();
};

const startWizard = () => {
  store.wizardPromptDismissed = true;
  store.openModal("setup-wizard");
};
</script>

<template>
  <ModalDialog title="Welcome">
    <p>
      Looks like you're just getting started. This app organizes your time under
      <strong>projects</strong> (like "Website Redesign") which can contain <strong>tasks</strong>
      (like "Design" or "Development") that you track time against.
    </p>
    <p>Want a quick wizard to set up your first project and a few tasks?</p>
    <div class="modal-buttons">
      <button type="button" class="btn-secondary" @click="dismiss">Not now</button>
      <button type="button" class="btn-primary" @click="startWizard">
        Set up my first project
      </button>
    </div>
  </ModalDialog>
</template>
