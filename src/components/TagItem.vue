<script setup lang="ts">
import type { fhtTag } from "../types";
import Trash from "../assets/trash.svg";
import Edit from "../assets/edit.svg";
import Plus from "../assets/plus.svg";
import Grip from "../assets/grip.svg";
import ChevronDown from "../assets/chevron-down.svg";
import Play from "../assets/play.svg";
import Resume from "../assets/resume.svg";
import Stop from "../assets/stop.svg";
import Pause from "../assets/pause.svg";
import { useTimerStore } from "../timerStore";
import ModalDialog from "./ModalDialog.vue";
import TimeDisplay from "./TimeDisplay.vue";
import EditTag from "./EditTag.vue";
import StatusDot from "./StatusDot.vue";
import IconButton from "./IconButton.vue";
import QuickStartButton from "./QuickStartButton.vue";
import { computed } from "vue";

const store = useTimerStore();

const props = defineProps<{ tag: fhtTag }>();

const id = `${props.tag.parent}//${props.tag.name}`;
const status = computed(() => store.getStatus(id));
const collapsed = computed(() => store.isCollapsed(id));

const childSummary = computed(() => {
  const children = store.getTags(id);
  if (!children.length) {
    return "";
  }
  const count = `${children.length} tag${children.length === 1 ? "" : "s"}`;
  return `${count}: ${children.map((child) => child.name).join(", ")}`;
});
</script>

<template>
  <div class="tag card" :data-status="status" :data-tag-id="id">
    <header>
      <h2 :class="{ collapsed }">
        <Grip class="icon drag-handle" aria-hidden="true" />
        <IconButton
          :label="collapsed ? 'Expand tag' : 'Collapse tag'"
          size="small"
          class="collapse-toggle"
          :class="{ collapsed }"
          @click="store.toggleCollapsed(id)"
        >
          <ChevronDown class="icon" />
        </IconButton>
        <StatusDot :status="status" />
        <span class="tag-name">{{ tag.name }}</span>
        <span v-if="collapsed && childSummary" class="child-summary">{{ childSummary }}</span>
      </h2>
      <section class="actions icons" v-if="!collapsed">
        <IconButton
          label="Remove tag"
          size="small"
          @click="store.openModal('remove-tag', tag.parent, tag.name)"
        >
          <Trash class="icon" />
        </IconButton>
        <IconButton
          label="Edit tag"
          size="small"
          @click="store.openModal('edit-tag', tag.parent, tag.name)"
        >
          <Edit class="icon" />
        </IconButton>
        <IconButton label="Add tag" size="small" @click="store.openModal('add-tag', id)">
          <Plus class="icon" />
        </IconButton>
        <QuickStartButton :parent="id" size="small" />
      </section>
    </header>
    <template v-if="!collapsed">
      <p>{{ tag.description }}</p>
      <div class="time-row">
        <TimeDisplay class="tag-time" :time="store.getTime(id)" />
        <section class="controls icons">
          <IconButton
            label="Start"
            @click="store.startTimer(id)"
            v-if="!store.isRunning(id) && status !== 'paused'"
          >
            <Play class="icon" />
          </IconButton>
          <IconButton v-if="store.isRunning(id)" label="Stop" @click="store.stopTimer(id)">
            <Stop class="icon" />
          </IconButton>
          <IconButton
            v-if="status === 'paused' && store.isRunning(id, false)"
            label="Resume"
            @click="store.resumeTimer(id)"
          >
            <Resume class="icon" />
          </IconButton>
          <IconButton
            v-else-if="status === 'running' || status === 'sub-running'"
            label="Pause"
            @click="store.startTimer(id, false)"
          >
            <Pause class="icon" />
          </IconButton>
        </section>
      </div>
      <div class="nested"><slot></slot></div>
    </template>

    <ModalDialog v-if="store.isModal('remove-tag', tag.parent, tag.name)" title="Are you sure?">
      <p>Remove tag "{{ tag.name }}" and all it's sub-tags?</p>
      <div class="modal-buttons">
        <button class="btn-secondary" @click="store.modal = ''">Cancel</button>
        <button class="btn-destructive" @click="store.removeTag(`${tag.parent}//${tag.name}`)">
          Remove
        </button>
      </div>
    </ModalDialog>
    <EditTag
      v-if="store.isModal('edit-tag', tag.parent, tag.name)"
      :id="id"
      :parent="tag.parent"
      title="Edit Tag"
    />
  </div>
</template>

<style scoped>
.card {
  padding: 0.6rem 0.85rem 0.8rem;
}
header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;

  @media screen and (max-width: 480px) {
    flex-direction: column;
    align-items: stretch;
    gap: 0.35rem;
  }
}
h2 {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  min-width: 0;
  flex: 1;
  font-size: 1.05rem;

  & .status-dot {
    margin-top: 0.45em;
  }

  & .tag-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow-wrap: break-word;
  }

  & .child-summary {
    flex: 1 1 0%;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.85em;
    font-weight: 400;
    opacity: 0.55;
  }

  &.collapsed .tag-name {
    flex: 0 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  & .drag-handle {
    flex: none;
    width: 14px;
    height: 14px;
    margin-top: 0.5em;
    opacity: 0.4;
    cursor: grab;
    touch-action: none;

    &:hover {
      opacity: 0.8;
    }

    &:active {
      cursor: grabbing;
    }
  }

  & .collapse-toggle {
    flex: none;
    margin: -0.4em -0.4em -0.4em -0.15em;

    & .icon {
      width: 16px;
      height: 16px;
      transition: transform 0.15s ease;
    }

    &.collapsed .icon {
      transform: rotate(-90deg);
    }
  }
}
.actions {
  flex: none;
  gap: 0.4rem;

  & .icon {
    width: 18px;
    height: 18px;
  }

  @media screen and (max-width: 480px) {
    justify-content: flex-end;
  }
}
p {
  margin: 0.3rem 0 0;
  font-size: 0.85rem;
  opacity: 0.75;
}
.time-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-top: 0.4rem;

  & .icon {
    width: 32px;
    height: 32px;
  }

  @media screen and (max-width: 480px) {
    gap: 0.6rem;

    & .icon {
      width: 26px;
      height: 26px;
    }
  }
}
.tag-time {
  font-size: 1.7rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;

  @media screen and (max-width: 480px) {
    font-size: 1.3rem;
  }
}
.nested {
  margin-top: 1rem;
}
</style>
