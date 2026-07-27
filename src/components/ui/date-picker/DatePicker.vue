<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { computed } from 'vue';
import { parseDate, type DateValue } from '@internationalized/date';
import { Calendar } from '@lucide/vue';
import { DatePickerField, DatePickerInput, DatePickerRoot, DatePickerTrigger } from 'reka-ui';
import { cn } from '@/lib/utils';
import DatePickerPanel from './DatePickerPanel.vue';

const props = defineProps<{
  // ISO string YYYY-MM-DD, '' = nessuna data (come i vecchi input nativi)
  modelValue?: string;
  id?: string;
  disabled?: boolean;
  class?: HTMLAttributes['class'];
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void;
}>();

const value = computed<DateValue | undefined>(() =>
  props.modelValue && /^\d{4}-\d{2}-\d{2}$/.test(props.modelValue)
    ? parseDate(props.modelValue)
    : undefined,
);

function onUpdate(v: DateValue | undefined) {
  emit('update:modelValue', v ? v.toString() : '');
}
</script>

<template>
  <DatePickerRoot
    :model-value="value"
    locale="it"
    :week-starts-on="1"
    weekday-format="short"
    :disabled="disabled"
    @update:model-value="onUpdate"
  >
    <DatePickerField
      v-slot="{ segments }"
      :id="id"
      :class="
        cn(
          'border-input dark:bg-input/30 flex h-9 w-full min-w-0 items-center rounded-md border bg-transparent px-3 py-1 text-base tabular-nums shadow-xs transition-[color,box-shadow] select-none md:text-sm',
          'focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-3',
          'data-[disabled]:pointer-events-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
          props.class,
        )
      "
    >
      <template v-for="item in segments" :key="item.part">
        <DatePickerInput v-if="item.part === 'literal'" :part="item.part">
          {{ item.value }}
        </DatePickerInput>
        <DatePickerInput
          v-else
          :part="item.part"
          class="data-[placeholder]:text-muted-foreground focus:bg-accent focus:text-accent-foreground rounded px-0.5 outline-none"
        >
          {{ item.value }}
        </DatePickerInput>
      </template>
      <DatePickerTrigger
        class="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 ml-auto rounded-sm outline-none focus-visible:ring-3"
      >
        <Calendar class="size-4" />
      </DatePickerTrigger>
    </DatePickerField>

    <DatePickerPanel />
  </DatePickerRoot>
</template>
