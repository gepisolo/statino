import type { Entry, Invoice } from '@/types/models';
import { daysInMonth, isoOf } from '@/lib/format';

// Aggregations shared by the statistics views. All ranges are
// [from, to] inclusive, YYYY-MM-DD.

export interface PeriodTotals {
  hours: number;
  billable: number;
  invoiced: number;
  collected: number;
}

// Reference date of an invoice for time bucketing: the issue date,
// falling back to the billed period's end for docs created before the
// field existed.
export function invoiceRefDate(i: Invoice): string {
  return i.date ?? i.dateTo;
}

// Hours and billable value come from the entries (at contract rate,
// invoiced or not); invoiced from the invoices by issue date; collected
// from the payments by collection date.
export function periodTotals(
  entries: Entry[],
  invoices: Invoice[],
  hourlyRates: Map<string, number>,
  from: string,
  to: string,
): PeriodTotals {
  let hours = 0;
  let billable = 0;
  for (const e of entries) {
    if (e.date < from || e.date > to) continue;
    hours += e.hours;
    billable += e.hours * (hourlyRates.get(e.contractId) ?? 0);
  }
  let invoiced = 0;
  let collected = 0;
  for (const i of invoices) {
    const ref = invoiceRefDate(i);
    if (ref >= from && ref <= to) invoiced += i.amount;
    if (i.payment && i.payment.date >= from && i.payment.date <= to) {
      collected += i.payment.amount;
    }
  }
  return { hours, billable, invoiced, collected };
}

// `month` is 1-based.
export function monthRange(year: number, month: number): [string, string] {
  return [isoOf(year, month, 1), isoOf(year, month, daysInMonth(year, month))];
}

export function yearRange(year: number): [string, string] {
  return [`${year}-01-01`, `${year}-12-31`];
}

// Months to divide by for "monthly average": full months for past
// years, months elapsed so far for the current one; 1 as a guard for
// future years (no meaningful average anyway).
export function elapsedMonths(year: number, today: Date): number {
  const current = today.getFullYear();
  if (year < current) return 12;
  if (year > current) return 1;
  return today.getMonth() + 1;
}
