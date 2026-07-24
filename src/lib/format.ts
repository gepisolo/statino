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

// Today as YYYY-MM-DD in local time.
export function todayIso(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}
