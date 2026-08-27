<script setup lang="ts">
import { computed } from "vue";
import type { timerStatus } from "../types";
import { statusLabels } from "../helpers";

const props = defineProps<{ status: timerStatus }>();

const label = computed(() => statusLabels[props.status]);
</script>

<template>
  <span class="status-dot" :class="status" :title="label"></span>
</template>
