<script setup lang="ts">
defineProps<{
  label: string;
  value: string;
  // Secondary line, e.g. the monthly average of the value above.
  sub?: string;
}>();
</script>

<template>
  <div class="rounded-lg border bg-card px-4 py-3 text-card-foreground">
    <div class="text-xs text-muted-foreground">{{ label }}</div>
    <div class="mt-1 text-2xl font-semibold tracking-tight">{{ value }}</div>
    <div v-if="sub" class="mt-0.5 text-xs text-muted-foreground">{{ sub }}</div>
  </div>
</template>
