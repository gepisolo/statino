const dateFmt = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

// `iso` is a YYYY-MM-DD string (the app's canonical date format).
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return dateFmt.format(new Date(y, m - 1, d));
}

const eurFmt = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

export function formatEur(n: number): string {
  return eurFmt.format(n);
}

const hoursFmt = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 });

export function formatHours(n: number): string {
  return hoursFmt.format(n);
}

const percentFmt = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 });

export function formatPercent(n: number): string {
  return `${percentFmt.format(n)}%`;
}

// Numeric form fields can hold either a string or a number: Vue
// auto-casts native `type="number"` inputs to number, but the field
// starts as (and can revert to) the empty string. Accepts the Italian
// comma decimal separator when the value is a string.
export function parseDecimal(v: string | number): number {
  return typeof v === 'number' ? v : Number(v.replace(',', '.'));
}

const monthFmt = new Intl.DateTimeFormat('it-IT', { month: 'long' });

// `month` is 1-based (1 = gennaio).
export function monthName(month: number): string {
  return monthFmt.format(new Date(2000, month - 1, 1));
}

const weekdayFmt = new Intl.DateTimeFormat('it-IT', { weekday: 'long' });

export function weekdayName(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return weekdayFmt.format(new Date(y, m - 1, d));
}

const weekdayShortFmt = new Intl.DateTimeFormat('it-IT', { weekday: 'short' });

export function weekdayShortName(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return weekdayShortFmt.format(new Date(y, m - 1, d));
}

export function isWeekend(iso: string): boolean {
  const [y, m, d] = iso.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return dow === 0 || dow === 6;
}

// `month` is 1-based.
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

// `month`/`day` are 1-based.
export function isoOf(year: number, month: number, day: number): string {
  return [year, String(month).padStart(2, '0'), String(day).padStart(2, '0')].join('-');
}

// Today as YYYY-MM-DD in local time.
export function todayIso(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}
