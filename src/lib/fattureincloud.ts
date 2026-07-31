// Costruzione del documento Fatture in Cloud a partire da una fattura
// statino. Modulo puro: nessun import Firebase, così il dialog può
// ricalcolare l'anteprima a ogni battuta senza toccare la rete. Il
// trasporto sta in `fattureincloudApi.ts`.

import { addDays, formatDate } from '@/lib/format';
import type { Contract, Entry, FicAggregation, FicConfig, Invoice, Project } from '@/types/models';

// --- Forma del documento FIC (solo i campi che scriviamo) ------------------

export interface FicItem {
  name: string;
  qty: number;
  net_price: number;
  vat: { id: number };
}

export interface FicIssuedDocument {
  type: 'invoice';
  entity: { id: number };
  date: string;
  numeration?: string;
  visible_subject?: string;
  notes?: string;
  currency: { id: 'EUR' };
  language: { code: 'it' };
  use_gross_prices: false;
  items_list: FicItem[];
  payment_method?: { id: number };
  payments_list?: { due_date: string; amount: number; status: 'not_paid' }[];
  e_invoice: boolean;
  ei_data?: { payment_method: string };
  stamp_duty: number;
  rivalsa: number;
  cassa: number;
  withholding_tax: number;
  withholding_tax_taxable: number;
}

// Quello che FIC restituisce alla creazione, ridotto a ciò che ci serve.
export interface FicCreatedDocument {
  id: number;
  number: number;
  numeration: string | null;
  date: string;
  amount_net: number;
  amount_vat: number;
  amount_gross: number;
  url: string | null;
}

export interface FicCompany {
  id: number;
  name: string;
}
export interface FicEntity {
  id: number;
  name: string;
  vat_number?: string | null;
  tax_code?: string | null;
}
export interface FicVatType {
  id: number;
  value: number;
  description: string;
  notes?: string | null;
}
export interface FicPaymentMethod {
  id: number;
  name: string;
}

// FIC non popola `description` sulle aliquote standard (per la 22% è vuota),
// quindi da sola darebbe una voce di menu senza testo: si ripiega sulla
// percentuale, che è comunque ciò che si cerca scorrendo l'elenco.
export function vatTypeLabel(v: FicVatType): string {
  const d = (v.description ?? '').trim();
  return d ? `${d} (${v.value}%)` : `Aliquota ${v.value}%`;
}

// --- Righe ----------------------------------------------------------------

export type BuiltLineKind = 'work' | 'discount' | 'rounding';

export interface BuiltLine {
  kind: BuiltLineKind;
  name: string;
  qty: number;
  netPrice: number;
  amount: number;
}

export interface BuildLinesInput {
  aggregation: FicAggregation;
  invoice: Invoice;
  entries: Entry[];
  contracts: Contract[];
  projects: Project[];
  /** Usata solo dalla modalità `unica`. */
  singleDescription: string;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const NO_PROJECT = 'Senza progetto';

function sumAmounts(lines: BuiltLine[]): number {
  return round2(lines.reduce((sum, l) => sum + l.amount, 0));
}

function line(kind: BuiltLineKind, name: string, qty: number, netPrice: number): BuiltLine {
  return { kind, name, qty, netPrice, amount: round2(qty * netPrice) };
}

// Il testo di una riga esplosa: descrizione dell'attività e, se c'è, il
// ticket tra parentesi. Niente data — è una scelta di prodotto: la fattura
// non è il registro delle attività, quello è il PDF dello statino.
function entryLabel(e: Entry, activity: string): string {
  const base = e.description.trim() || activity;
  const ticket = e.ticket.trim();
  return ticket ? `${base} (${ticket})` : base;
}

interface Group {
  key: string;
  name: string;
  hours: number;
  rate: number;
  projectId: string | null;
  activity: string;
}

function groupBy(
  entries: Entry[],
  keyOf: (e: Entry) => string,
  seed: (e: Entry) => Omit<Group, 'hours'>,
): Group[] {
  const map = new Map<string, Group>();
  for (const e of entries) {
    const key = keyOf(e);
    const found = map.get(key);
    if (found) found.hours += e.hours;
    else map.set(key, { ...seed(e), hours: e.hours });
  }
  return [...map.values()];
}

function workLines(input: BuildLinesInput, target: number): BuiltLine[] {
  const { aggregation, entries, contracts, projects, singleDescription } = input;
  const rateOf = new Map(contracts.map((c) => [c.id, c.hourlyRate]));
  const activityOf = new Map(contracts.map((c) => [c.id, c.activity]));
  const projectOf = new Map(projects.map((p) => [p.id, p.name]));
  const rate = (e: Entry) => rateOf.get(e.contractId) ?? 0;
  const activity = (e: Entry) => activityOf.get(e.contractId) ?? 'Attività';

  if (aggregation === 'unica') {
    return [line('work', singleDescription.trim() || 'Attività', 1, target)];
  }

  if (aggregation === 'esplose') {
    return entries.map((e) => line('work', entryLabel(e, activity(e)), e.hours, rate(e)));
  }

  if (aggregation === 'contratto') {
    return groupBy(
      entries,
      (e) => e.contractId,
      (e) => ({
        key: e.contractId,
        name: activity(e),
        rate: rate(e),
        projectId: null,
        activity: activity(e),
      }),
    )
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((g) => line('work', g.name, round2(g.hours), g.rate));
  }

  // 'progetto'. Il raggruppamento è per (progetto, contratto) e non per solo
  // progetto: se un progetto è stato lavorato su tariffe diverse, mediarle
  // produrrebbe un prezzo unitario inventato. Si spezza, e in quel caso il
  // nome porta anche l'attività — due righe omonime con prezzi diversi
  // sarebbero illeggibili per il cliente.
  const groups = groupBy(
    entries,
    (e) => `${e.projectId ?? ''}|${e.contractId}`,
    (e) => ({
      key: `${e.projectId ?? ''}|${e.contractId}`,
      name: e.projectId ? (projectOf.get(e.projectId) ?? NO_PROJECT) : NO_PROJECT,
      rate: rate(e),
      projectId: e.projectId,
      activity: activity(e),
    }),
  );
  const perProject = new Map<string, number>();
  for (const g of groups) perProject.set(g.name, (perProject.get(g.name) ?? 0) + 1);

  return groups
    .sort((a, b) => {
      // "Senza progetto" sempre ultimo, come già fanno statistiche e PDF.
      if ((a.name === NO_PROJECT) !== (b.name === NO_PROJECT))
        return a.name === NO_PROJECT ? 1 : -1;
      return a.name.localeCompare(b.name) || a.activity.localeCompare(b.activity);
    })
    .map((g) =>
      line(
        'work',
        (perProject.get(g.name) ?? 1) > 1 ? `${g.name} — ${g.activity}` : g.name,
        round2(g.hours),
        g.rate,
      ),
    );
}

/**
 * Le righe del documento, riconciliate sull'importo congelato della fattura.
 * Il bollo non compare: FIC lo somma da sé al totale (vedi `stamp_duty`).
 */
export function buildLines(input: BuildLinesInput): BuiltLine[] {
  const { invoice } = input;
  const discount = invoice.discount?.amount ?? 0;
  // `invoice.amount` è già al netto dello sconto: le righe di lavoro devono
  // ricostruire il lordo, perché lo sconto torna come riga a sé.
  const target = round2(invoice.amount + discount);

  const lines = workLines(input, target);

  if (discount > 0) {
    // Il campo `discount` di FIC è una percentuale per riga e non sa
    // esprimere uno sconto in euro: la riga negativa è l'unica codifica
    // fedele, e per giunta mostra al cliente la motivazione.
    lines.push(line('discount', invoice.discount?.reason || 'Sconto', 1, -round2(discount)));
  }

  // Ogni riga è arrotondata al centesimo: su molte righe la somma può
  // scostarsi dall'importo congelato. Meglio una riga esplicita che un
  // totale che non torna — qui i numeri devono riconciliare sempre.
  const delta = round2(round2(invoice.amount) - sumAmounts(lines));
  if (delta !== 0) {
    lines.push(line('rounding', 'Arrotondamento', 1, delta));
  }

  return lines;
}

// --- Totali ---------------------------------------------------------------

export interface DocumentTotals {
  taxable: number;
  rivalsa: number;
  cassa: number;
  vat: number;
  stampDuty: number;
  withholding: number;
  gross: number;
  /**
   * `false` quando rivalsa o cassa sono attive: l'ordine esatto con cui FIC
   * applica la cascata non è documentato, quindi il lordo qui è una stima e
   * la scadenza va lasciata calcolare a loro.
   */
  exact: boolean;
}

export function computeTotals(lines: BuiltLine[], config: FicConfig): DocumentTotals {
  const taxable = sumAmounts(lines);
  const rivalsa = round2((taxable * config.rivalsa) / 100);
  const cassa = round2(((taxable + rivalsa) * config.cassa) / 100);
  const vat = round2(((taxable + rivalsa + cassa) * config.vatValue) / 100);
  const stampDuty =
    config.stampDuty > 0 && taxable > config.stampDutyThreshold ? config.stampDuty : 0;
  const withholding = round2(
    (taxable * config.withholdingTaxTaxable * config.withholdingTax) / 10_000,
  );
  return {
    taxable,
    rivalsa,
    cassa,
    vat,
    stampDuty,
    withholding,
    gross: round2(taxable + rivalsa + cassa + vat + stampDuty - withholding),
    exact: config.rivalsa === 0 && config.cassa === 0,
  };
}

// --- Documento ------------------------------------------------------------

export interface BuildDocumentInput extends BuildLinesInput {
  config: FicConfig;
  entityId: number;
  /** Data del documento su FIC, chiesta nel dialog (default: oggi). */
  date: string;
}

export function buildIssuedDocument(input: BuildDocumentInput): FicIssuedDocument {
  const { config, invoice, entityId, date } = input;
  // Il dialog blocca prima di arrivare qui: se ci arriva lo stesso, meglio
  // fermarsi che emettere una fattura con un'IVA scelta da noi.
  if (config.vatId == null) {
    throw new Error('Tipo IVA non configurato per questo connettore.');
  }
  const vatId = config.vatId;
  const lines = buildLines(input);
  const totals = computeTotals(lines, config);

  const doc: FicIssuedDocument = {
    type: 'invoice',
    entity: { id: entityId },
    date,
    currency: { id: 'EUR' },
    language: { code: 'it' },
    use_gross_prices: false,
    items_list: lines.map((l) => ({
      name: l.name,
      qty: l.qty,
      net_price: l.netPrice,
      vat: { id: vatId },
    })),
    e_invoice: config.eInvoice,
    stamp_duty: totals.stampDuty,
    rivalsa: config.rivalsa,
    cassa: config.cassa,
    withholding_tax: config.withholdingTax,
    withholding_tax_taxable: config.withholdingTaxTaxable,
  };

  // `number` è deliberatamente assente: il progressivo lo assegna FIC, che
  // è il registro che conta per il fisco.
  if (config.numeration) doc.numeration = config.numeration;
  if (config.notes) doc.notes = config.notes;
  if (config.includePeriodSubject) {
    doc.visible_subject = `Periodo dal ${formatDate(invoice.dateFrom)} al ${formatDate(invoice.dateTo)}`;
  }
  if (config.paymentMethodId) doc.payment_method = { id: config.paymentMethodId };
  if (config.eInvoice && config.eiPaymentMethodCode) {
    doc.ei_data = { payment_method: config.eiPaymentMethodCode };
  }
  // Se il lordo non è ricostruibile con certezza si preferisce non mandare
  // affatto la scadenza: FIC la genera dal metodo di pagamento. Meglio un
  // dato in meno che un importo da pagare inventato.
  if (totals.exact) {
    doc.payments_list = [
      {
        due_date: addDays(date, config.paymentDueDays),
        amount: totals.gross,
        status: 'not_paid',
      },
    ];
  }

  return doc;
}

// --- Default -------------------------------------------------------------

/** Config vuota, usata alla prima connessione: i valori fiscali si scelgono
 *  poi dal modulo "Parametri fattura". */
export function defaultFicConfig(companyId: number, companyName: string): Omit<FicConfig, 'id'> {
  return {
    companyId,
    companyName,
    tokenHint: '',
    tokenUpdatedAt: '',
    numeration: '',
    paymentMethodId: null,
    paymentMethodName: '',
    paymentDueDays: 30,
    includePeriodSubject: true,
    defaultAggregation: 'contratto',
    vatId: null,
    vatValue: 0,
    vatDescription: '',
    eInvoice: true,
    eiPaymentMethodCode: 'MP05',
    stampDuty: 0,
    stampDutyThreshold: 77.47,
    rivalsa: 0,
    cassa: 0,
    withholdingTax: 0,
    withholdingTaxTaxable: 100,
    notes: '',
    mappings: [],
  };
}

// Codici "ModalitàPagamento" del tracciato FatturaPA: sono dello SdI, non di
// Fatture in Cloud, che li usa tali e quali in `ei_data.payment_method`.
// Elencati per non costringere a ricordarli a memoria.
export const EI_PAYMENT_METHODS: readonly { code: string; label: string }[] = [
  { code: 'MP05', label: 'Bonifico' },
  { code: 'MP01', label: 'Contanti' },
  { code: 'MP02', label: 'Assegno' },
  { code: 'MP03', label: 'Assegno circolare' },
  { code: 'MP04', label: 'Contanti presso tesoreria' },
  { code: 'MP06', label: 'Vaglia cambiario' },
  { code: 'MP07', label: 'Bollettino bancario' },
  { code: 'MP08', label: 'Carta di pagamento' },
  { code: 'MP09', label: 'RID' },
  { code: 'MP10', label: 'RID utenze' },
  { code: 'MP11', label: 'RID veloce' },
  { code: 'MP12', label: 'RIBA' },
  { code: 'MP13', label: 'MAV' },
  { code: 'MP14', label: 'Quietanza erario' },
  { code: 'MP15', label: 'Giroconto su conti di contabilità speciale' },
  { code: 'MP16', label: 'Domiciliazione bancaria' },
  { code: 'MP17', label: 'Domiciliazione postale' },
  { code: 'MP18', label: 'Bollettino di c/c postale' },
  { code: 'MP19', label: 'SEPA Direct Debit' },
  { code: 'MP20', label: 'SEPA Direct Debit CORE' },
  { code: 'MP21', label: 'SEPA Direct Debit B2B' },
  { code: 'MP22', label: 'Trattenuta su somme già corrisposte' },
  { code: 'MP23', label: 'PagoPA' },
];

export const AGGREGATION_LABELS: Record<FicAggregation, string> = {
  unica: 'Voce unica',
  esplose: 'Voci esplose',
  contratto: 'Aggregate per contratto',
  progetto: 'Aggregate per progetto',
};
