<script setup lang="ts">
import { computed, ref } from "vue";
import { useTimerStore } from "../timerStore";
import { pathOf } from "../helpers";
import type { fhtTag } from "../types";
import ModalDialog from "./ModalDialog.vue";
import IconButton from "./IconButton.vue";
import Trash from "../assets/trash.svg";

const store = useTimerStore();

const step = ref<1 | 2 | 3 | 4>(1);
const projectName = ref("");
const projectTag = ref<fhtTag | null>(null);
const taskName = ref("");

const projectPath = computed(() => (projectTag.value ? pathOf(projectTag.value) : ""));
const tasks = computed(() => (projectTag.value ? store.getTags(projectPath.value) : []));
const projectNameError = computed(() =>
  store.tagNameError("", projectName.value, projectTag.value?.uuid),
);
const taskNameError = computed(() => store.tagNameError(projectPath.value, taskName.value));

const createProject = () => {
  if (projectNameError.value) {
    return;
  }
  if (!projectTag.value) {
    projectTag.value = store.addTag("", projectName.value.trim());
  }
  step.value = 3;
};

const addTask = () => {
  if (taskNameError.value) {
    return;
  }
  store.addTag(projectPath.value, taskName.value.trim());
  taskName.value = "";
};

// store.removeTag() also clears store.modal as a side effect (it's written for the tag tree's
// own delete-confirmation flow), which would otherwise silently close this whole wizard.
const removeTask = (task: fhtTag) => {
  store.removeTag(pathOf(task));
  store.openModal("setup-wizard");
};

const finish = () => {
  store.closeModal();
};
</script>

<template>
  <ModalDialog title="Quick start">
    <template v-if="step === 1">
      <p>
        Projects contain tasks - for example a "Website Redesign" project might have "Design" and
        "Development" tasks under it. Let's set up your first one.
      </p>
      <div class="modal-buttons">
        <button type="button" class="btn-primary" @click="step = 2">Next</button>
      </div>
    </template>

    <template v-else-if="step === 2">
      <form @submit.prevent="createProject">
        <div class="form-stack">
          <label>
            Project name
            <input type="text" v-model="projectName" placeholder="e.g. Website Redesign" v-focus />
          </label>
        </div>
        <p class="error" v-if="projectName && projectNameError">{{ projectNameError }}</p>
        <div class="modal-buttons">
          <button type="button" class="btn-secondary" @click="step = 1">Back</button>
          <button type="submit" class="btn-primary" :disabled="!!projectNameError">Next</button>
        </div>
      </form>
    </template>

    <template v-else-if="step === 3">
      <p>Add a few tasks under "{{ projectTag?.name }}" - you can always add more later.</p>
      <form class="task-form" @submit.prevent="addTask">
        <input type="text" v-model="taskName" placeholder="e.g. Design" v-focus />
        <button type="submit" class="btn-secondary" :disabled="!!taskNameError">Add</button>
      </form>
      <p class="error" v-if="taskName && taskNameError">{{ taskNameError }}</p>
      <ul class="task-list">
        <li v-for="task in tasks" :key="task.uuid">
          <span>{{ task.name }}</span>
          <IconButton label="Remove task" size="small" @click="removeTask(task)">
            <Trash class="icon" />
          </IconButton>
        </li>
      </ul>
      <div class="modal-buttons">
        <button type="button" class="btn-secondary" @click="step = 2">Back</button>
        <button type="button" class="btn-primary" @click="step = 4">Next</button>
      </div>
    </template>

    <template v-else-if="step === 4">
      <p>
        You're all set! You can add more projects and tasks anytime with the
        <strong>+</strong> button next to the tag list.
      </p>
      <div class="modal-buttons">
        <button type="button" class="btn-primary" @click="finish">Done</button>
      </div>
    </template>
  </ModalDialog>
</template>

<style scoped>
.form-stack {
  & label {
    font-size: 0.85rem;
    opacity: 0.8;
  }
}

.error {
  color: var(--fht-error-color);
  font-size: 0.85rem;
}

.task-form {
  display: flex;
  gap: 0.5rem;
  margin: 0.75rem 0;

  & input {
    flex: 1;
  }
}

.task-list {
  list-style: none;
  margin: 0;
  padding: 0;

  & li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.35rem 0;
    border-bottom: 1px solid var(--fht-element-border-color);
  }
}
</style>
