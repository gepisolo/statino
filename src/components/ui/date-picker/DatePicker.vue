<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { computed } from 'vue';
import { parseDate, type DateValue } from '@internationalized/date';
import { Calendar, ChevronLeft, ChevronRight } from '@lucide/vue';
import {
  DatePickerCalendar,
  DatePickerCell,
  DatePickerCellTrigger,
  DatePickerContent,
  DatePickerField,
  DatePickerGrid,
  DatePickerGridBody,
  DatePickerGridHead,
  DatePickerGridRow,
  DatePickerHeadCell,
  DatePickerHeader,
  DatePickerHeading,
  DatePickerInput,
  DatePickerNext,
  DatePickerPrev,
  DatePickerRoot,
  DatePickerTrigger,
} from 'reka-ui';
import { cn } from '@/lib/utils';

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

    <DatePickerContent
      align="end"
      :side-offset="4"
      class="bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 z-50 rounded-md border p-3 shadow-md"
    >
      <DatePickerCalendar v-slot="{ weekDays, grid }">
        <DatePickerHeader class="flex items-center justify-between gap-2">
          <DatePickerPrev
            class="hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring/50 inline-flex size-7 items-center justify-center rounded-md outline-none focus-visible:ring-3 disabled:pointer-events-none disabled:opacity-50"
          >
            <ChevronLeft class="size-4" />
          </DatePickerPrev>
          <DatePickerHeading class="text-sm font-medium capitalize" />
          <DatePickerNext
            class="hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring/50 inline-flex size-7 items-center justify-center rounded-md outline-none focus-visible:ring-3 disabled:pointer-events-none disabled:opacity-50"
          >
            <ChevronRight class="size-4" />
          </DatePickerNext>
        </DatePickerHeader>
        <DatePickerGrid
          v-for="month in grid"
          :key="month.value.toString()"
          class="mt-3 w-full border-collapse space-y-1 select-none"
        >
          <DatePickerGridHead>
            <DatePickerGridRow class="flex w-full justify-between">
              <DatePickerHeadCell
                v-for="day in weekDays"
                :key="day"
                class="text-muted-foreground w-8 text-xs font-normal"
              >
                {{ day }}
              </DatePickerHeadCell>
            </DatePickerGridRow>
          </DatePickerGridHead>
          <DatePickerGridBody>
            <DatePickerGridRow
              v-for="(weekDates, index) in month.rows"
              :key="`week-${index}`"
              class="flex w-full"
            >
              <DatePickerCell
                v-for="weekDate in weekDates"
                :key="weekDate.toString()"
                :date="weekDate"
              >
                <DatePickerCellTrigger
                  :day="weekDate"
                  :month="month.value"
                  class="hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring/50 data-[selected]:bg-primary data-[selected]:text-primary-foreground data-[selected]:hover:bg-primary data-[today]:not-data-[selected]:text-primary data-[outside-view]:text-muted-foreground/50 flex size-8 items-center justify-center rounded-md text-sm font-normal whitespace-nowrap outline-none focus-visible:ring-3 data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[today]:font-semibold"
                />
              </DatePickerCell>
            </DatePickerGridRow>
          </DatePickerGridBody>
        </DatePickerGrid>
      </DatePickerCalendar>
    </DatePickerContent>
  </DatePickerRoot>
</template>
