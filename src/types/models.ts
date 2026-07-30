// Firestore document shapes. All documents live under `users/{uid}/…` —
// the app is single-user, rules only allow the owner.

export interface Client {
  id: string;
  name: string;
}

export interface Project {
  id: string;
  clientId: string;
  name: string;
  // Inactive projects are hidden from the entry editor's dropdown.
  // Docs created before this field existed don't have it: missing = active.
  active?: boolean;
  // Badge colors, '#rrggbb'. Both null (or missing, on older docs) means
  // the badge keeps the theme's default look, which follows light/dark;
  // a custom pair is fixed, so it must read on both. See `lib/colors.ts`.
  bgColor?: string | null;
  textColor?: string | null;
}

// One contract per (client, activity): the same client can pay different
// hourly rates for different activities. `annualHours` is the yearly
// allowance, counted over the calendar year.
export interface Contract {
  id: string;
  clientId: string;
  activity: string;
  startDate: string; // YYYY-MM-DD inclusive
  endDate: string; // YYYY-MM-DD inclusive
  annualHours: number;
  hourlyRate: number;
}

// A single activity row inside a day. The day's total hours are the sum
// of its entries. `date` is the calendar day the work happened.
export interface Entry {
  id: string;
  date: string; // YYYY-MM-DD
  clientId: string;
  contractId: string;
  projectId: string | null;
  ticket: string;
  link: string;
  description: string;
  hours: number;
  // Set when the entry has been billed: the entry is locked (only the
  // description stays editable, no deletion). Docs created before this
  // field existed don't have it: missing = not invoiced.
  invoiceId?: string | null;
}

// Fiscal profile of a calendar year (one doc per year). The
// profitability index (indice di redditività, %) and the revenue
// limits (€) only apply to the forfettario regime — null otherwise.
// Above `forfaitLimit` the regime is lost from the next year; above
// `hardLimit` it is lost immediately and the current year's invoices
// must all be recomputed. Docs created before the limit fields existed
// don't have them.
export type FiscalRegime = 'ordinario' | 'forfettario';
export interface FiscalYear {
  id: string;
  year: number;
  regime: FiscalRegime;
  profitabilityIndex: number | null;
  forfaitLimit?: number | null;
  hardLimit?: number | null;
}

// A tax/contribution bracket: `rate` (%) applies to the taxable income
// slice between `fromIncome` and `toIncome` (€, `toIncome` null = no
// upper bound). Multiple rows per year.
export type TaxRateType = 'contributi' | 'tasse';
export interface TaxRate {
  id: string;
  year: number;
  type: TaxRateType;
  name: string;
  rate: number;
  fromIncome: number;
  toIncome: number | null;
}

// What was actually collected for an invoice — may differ from the
// invoiced `amount` (fees, withholding, roundings).
export interface InvoicePayment {
  date: string; // YYYY-MM-DD
  amount: number;
  description: string;
}

// Kanban board of activities ("Attività"), separate from statino
// entries. `num` is a human-facing auto-increment; `order` is the
// manual position inside a column (lower = higher up), assigned so a
// task entering a column lands on top. Archiving keeps the done
// outcome (`archived` flag instead of a status) so OK/KO survives.
// `hours` (optional) only makes sense once done. `createdAt` is the
// creation day, `doneAt` the day the task entered Done OK/KO (cleared
// if it moves back); both missing on docs predating them, `doneAt`
// stays unknown for tasks already done before the field existed.
// `statinoEntryId` links the statino entry created from the task via
// the "A statino" button (one-shot: set = the button is gone).
export type TaskStatus = 'todo' | 'wip' | 'done_ok' | 'done_ko';
export interface Task {
  id: string;
  num: number;
  clientId: string;
  title: string;
  description: string;
  status: TaskStatus;
  archived: boolean;
  hours: number | null;
  order: number;
  createdAt?: string | null; // YYYY-MM-DD
  doneAt?: string | null; // YYYY-MM-DD
  statinoEntryId?: string | null;
}

// A discount applied at invoice creation: `amount` (€) is subtracted
// from the billed hours×rate, `reason` says why.
export interface InvoiceDiscount {
  amount: number;
  reason: string;
}

// An issued invoice: the entries of `clientId` dated within
// [dateFrom, dateTo] that were not yet invoiced get locked with this
// invoice's id. `hours`/`amount` are frozen at creation time.
// `payment` missing or null = not collected yet. `date` is the issue
// date, the reference for "invoiced in the year/month" stats; docs
// created before it existed don't have it (fall back to dateTo).
// `amount` is already net of `discount` (gross = amount +
// discount.amount); discount missing or null = none.
export interface Invoice {
  id: string;
  clientId: string;
  number: string;
  date?: string; // YYYY-MM-DD
  dateFrom: string; // YYYY-MM-DD inclusive
  dateTo: string; // YYYY-MM-DD inclusive
  hours: number;
  amount: number;
  discount?: InvoiceDiscount | null;
  payment?: InvoicePayment | null;
}
