<script setup lang="ts">
import { computed } from 'vue';
import { CircleCheck, OctagonAlert, TriangleAlert } from '@lucide/vue';
import { formatEur } from '@/lib/format';

// Invoiced total of the year against the forfettario revenue limits.
// Status colors are the dataviz reserved set, always icon + label.
const props = defineProps<{
  invoiced: number;
  forfaitLimit: number;
  hardLimit: number | null;
}>();

const scale = computed(() => props.hardLimit ?? props.forfaitLimit);
const fillPct = computed(() => Math.min(100, (props.invoiced / scale.value) * 100));
const forfaitPct = computed(() => Math.min(100, (props.forfaitLimit / scale.value) * 100));

const status = computed(() => {
  if (props.hardLimit !== null && props.invoiced > props.hardLimit) {
    return {
      color: '#d03b3b',
      icon: OctagonAlert,
      label: 'Oltre il limite hard: ricalcolo delle fatture dell’anno',
    };
  }
  if (props.invoiced > props.forfaitLimit) {
    return {
      color: '#ec835a',
      icon: TriangleAlert,
      label: 'Oltre il limite forfettario: regime perso dal prossimo anno',
    };
  }
  if (props.invoiced > props.forfaitLimit * 0.8) {
    return { color: '#fab219', icon: TriangleAlert, label: 'Vicino al limite forfettario' };
  }
  return { color: '#0ca30c', icon: CircleCheck, label: 'Sotto il limite forfettario' };
});
</script>

<template>
  <div class="space-y-2">
    <div class="flex items-baseline justify-between text-sm">
      <span class="text-muted-foreground">Fatturato vs limiti forfettario</span>
      <span class="tabular-nums">
        {{ formatEur(invoiced) }}
        <span class="text-muted-foreground">/ {{ formatEur(forfaitLimit) }}</span>
      </span>
    </div>
    <div class="relative h-2 overflow-hidden rounded-full bg-secondary">
      <div
        class="h-full rounded-full"
        :style="{ width: `${fillPct}%`, background: status.color }"
      />
      <div
        v-if="hardLimit !== null && forfaitPct < 100"
        class="absolute inset-y-0 w-px bg-foreground/40"
        :style="{ left: `${forfaitPct}%` }"
        :title="`Limite forfettario: ${formatEur(forfaitLimit)}`"
      />
    </div>
    <div class="flex items-center gap-1.5 text-xs" :style="{ color: status.color }">
      <component :is="status.icon" class="size-3.5" />
      {{ status.label }}
      <span class="text-muted-foreground">
        ({{ Math.round((invoiced / forfaitLimit) * 100) }}% del limite<template
          v-if="hardLimit !== null"
          >, hard {{ formatEur(hardLimit) }}</template
        >)
      </span>
    </div>
  </div>
</template>
