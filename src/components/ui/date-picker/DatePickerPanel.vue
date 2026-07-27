<script setup lang="ts">
import { ChevronLeft, ChevronRight } from '@lucide/vue';
import {
  DatePickerCalendar,
  DatePickerCell,
  DatePickerCellTrigger,
  DatePickerContent,
  DatePickerGrid,
  DatePickerGridBody,
  DatePickerGridHead,
  DatePickerGridRow,
  DatePickerHeadCell,
  DatePickerHeader,
  DatePickerHeading,
  DatePickerNext,
  DatePickerPrev,
} from 'reka-ui';

withDefaults(defineProps<{ align?: 'start' | 'center' | 'end' }>(), { align: 'end' });
</script>

<template>
  <DatePickerContent
    :align="align"
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
</template>
