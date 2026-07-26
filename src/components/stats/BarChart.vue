<script setup lang="ts">
import { computed, ref } from 'vue';

// Vertical grouped bar chart, up to 3 series (the palette's all-pairs
// safe cap). One unit per chart: never mix hours and euros here.
export interface BarSeries {
  name: string;
  values: number[];
}

const props = defineProps<{
  labels: string[];
  series: BarSeries[];
  formatValue: (n: number) => string;
  // Compact formatter for axis ticks (defaults to formatValue).
  formatTick?: (n: number) => string;
}>();

const W = 720;
const H = 240;
const PAD = { top: 10, right: 8, bottom: 24, left: 52 };
const plotW = W - PAD.left - PAD.right;
const plotH = H - PAD.top - PAD.bottom;

const tickFmt = computed(() => props.formatTick ?? props.formatValue);

const maxValue = computed(() =>
  Math.max(1, ...props.series.flatMap((s) => s.values.filter((v) => Number.isFinite(v)))),
);

function niceCeil(x: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(x)));
  const m = x / pow;
  const nice = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10;
  return nice * pow;
}

const yMax = computed(() => niceCeil(maxValue.value));
const ticks = computed(() => [0.25, 0.5, 0.75, 1].map((t) => t * yMax.value));

const groupW = computed(() => plotW / Math.max(1, props.labels.length));
const barW = computed(() =>
  Math.min(
    26,
    Math.max(3, (groupW.value * 0.72 - (props.series.length - 1) * 2) / props.series.length),
  ),
);

function barX(li: number, si: number): number {
  const total = props.series.length * barW.value + (props.series.length - 1) * 2;
  return PAD.left + li * groupW.value + (groupW.value - total) / 2 + si * (barW.value + 2);
}

function barY(v: number): number {
  return PAD.top + plotH * (1 - v / yMax.value);
}

// Bars are anchored to the baseline and rounded only at the data end.
function barPath(li: number, si: number, v: number): string {
  const x = barX(li, si);
  const w = barW.value;
  const h = PAD.top + plotH - barY(v);
  if (h <= 0) return '';
  const r = Math.min(3, h, w / 2);
  const base = PAD.top + plotH;
  return `M${x},${base} v${-(h - r)} q0,${-r} ${r},${-r} h${w - 2 * r} q${r},0 ${r},${r} v${h - r} z`;
}

const hoverIndex = ref<number | null>(null);

const tooltipLeft = computed(() => {
  if (hoverIndex.value === null) return '0%';
  const cx = PAD.left + hoverIndex.value * groupW.value + groupW.value / 2;
  return `${(cx / W) * 100}%`;
});
</script>

<template>
  <div class="chart relative" @mouseleave="hoverIndex = null">
    <div v-if="series.length > 1" class="mb-2 flex flex-wrap gap-x-4 gap-y-1">
      <span
        v-for="(s, si) in series"
        :key="s.name"
        class="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
      >
        <span class="size-2.5 rounded-sm" :style="{ background: `var(--s${si + 1})` }" />
        {{ s.name }}
      </span>
    </div>

    <svg :viewBox="`0 0 ${W} ${H}`" class="w-full" role="img">
      <line
        v-for="t in ticks"
        :key="`g-${t}`"
        :x1="PAD.left"
        :x2="W - PAD.right"
        :y1="barY(t)"
        :y2="barY(t)"
        class="stroke-border"
        stroke-width="1"
      />
      <line
        :x1="PAD.left"
        :x2="W - PAD.right"
        :y1="PAD.top + plotH"
        :y2="PAD.top + plotH"
        class="stroke-muted-foreground/40"
        stroke-width="1"
      />
      <text
        v-for="t in ticks"
        :key="`t-${t}`"
        :x="PAD.left - 6"
        :y="barY(t) + 3"
        text-anchor="end"
        class="fill-muted-foreground"
        font-size="10"
      >
        {{ tickFmt(t) }}
      </text>
      <text
        v-for="(label, li) in labels"
        :key="`l-${li}`"
        :x="PAD.left + li * groupW + groupW / 2"
        :y="H - 8"
        text-anchor="middle"
        class="fill-muted-foreground"
        font-size="10"
      >
        {{ label }}
      </text>

      <template v-for="(s, si) in series" :key="`s-${si}`">
        <path
          v-for="(v, li) in s.values"
          :key="`b-${si}-${li}`"
          :d="barPath(li, si, Math.min(v, yMax))"
          :fill="`var(--s${si + 1})`"
          :opacity="hoverIndex === null || hoverIndex === li ? 1 : 0.45"
        />
      </template>

      <rect
        v-for="(_, li) in labels"
        :key="`h-${li}`"
        :x="PAD.left + li * groupW"
        :y="PAD.top"
        :width="groupW"
        :height="plotH"
        fill="transparent"
        @mouseenter="hoverIndex = li"
      />
    </svg>

    <div
      v-if="hoverIndex !== null"
      class="pointer-events-none absolute top-6 z-10 -translate-x-1/2 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
      :style="{ left: tooltipLeft }"
    >
      <div class="mb-1 font-medium">{{ labels[hoverIndex] }}</div>
      <div v-for="(s, si) in series" :key="s.name" class="flex items-center gap-1.5">
        <span
          v-if="series.length > 1"
          class="size-2 rounded-sm"
          :style="{ background: `var(--s${si + 1})` }"
        />
        <span v-if="series.length > 1" class="text-muted-foreground">{{ s.name }}</span>
        <span class="ml-auto pl-3 font-medium tabular-nums">
          {{ formatValue(s.values[hoverIndex] ?? 0) }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Validated categorical palette (dataviz reference): blue, orange,
   aqua — the first three slots are all-pairs safe in both modes. */
.chart {
  --s1: #2a78d6;
  --s2: #eb6834;
  --s3: #1baf7a;
}
:global(.dark) .chart {
  --s1: #3987e5;
  --s2: #d95926;
  --s3: #199e70;
}
</style>
