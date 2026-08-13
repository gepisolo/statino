<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { toast } from 'vue-sonner';
import { ChevronDown, ExternalLink, FileDown, Lock, Pencil, Plus, Trash2 } from '@lucide/vue';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import EntryFormDialog from '@/components/statino/EntryFormDialog.vue';
import TaskFormDialog from '@/components/tasks/TaskFormDialog.vue';
import {
  clientsRepo,
  contractsRepo,
  entriesRepo,
  fiscalYearsRepo,
  invoicesRepo,
  projectsRepo,
  tasksRepo,
  taxRatesRepo,
  extractErrorMessage,
} from '@/lib/db';
import { exportStatinoPdf, type StatinoPdfMode } from '@/lib/pdf';
import { badgeClass, badgeStyle } from '@/lib/colors';
import { computeNet } from '@/lib/tax';
import {
  daysInMonth,
  formatDate,
  formatEur,
  formatHours,
  isWeekend,
  isoOf,
  monthName,
  todayIso,
  weekdayName,
  weekdayShortName,
} from '@/lib/format';
import { useAuthStore } from '@/stores/auth';
import type {
  Client,
  Contract,
  Entry,
  FiscalYear,
  Invoice,
  Project,
  Task,
  TaxRate,
} from '@/types/models';

const auth = useAuthStore();

const LAST_CLIENT_KEY = 'statino:lastClient';

const now = new Date();
const year = ref(now.getFullYear());
const month = ref(now.getMonth() + 1);
const clientId = ref('');

const loadingCatalogs = ref(true);
const loadingEntries = ref(true);
const clients = ref<Client[]>([]);
const contracts = ref<Contract[]>([]);
const projects = ref<Project[]>([]);
const invoices = ref<Invoice[]>([]);
const fiscalYears = ref<FiscalYear[]>([]);
const taxRates = ref<TaxRate[]>([]);
// All entries of the selected calendar year (any client) — the summary
// panel needs the year to compute progress against the annual allowance.
const entries = ref<Entry[]>([]);

const entryFormOpen = ref(false);
const entryFormMode = ref<'create' | 'edit'>('create');
const entryFormEntry = ref<Entry | null>(null);
const entryFormDate = ref(todayIso());

const deleteOpen = ref(false);
const deleteTarget = ref<Entry | null>(null);
const deleteSubmitting = ref(false);

// --- Internal tickets: "#<num>" in an entry's ticket field points to a
// task of the Attività board; the grid renders it clickable and opens
// the task dialog (tasks lazy-loaded at the first click). ---
const tasks = ref<Task[] | null>(null);
const taskDialogOpen = ref(false);
const taskDialogTask = ref<Task | null>(null);
const taskLoading = ref(false);

function internalTicketNum(ticket: string): number | null {
  const m = /^#(\d+)$/.exec(ticket.trim());
  return m ? Number(m[1]) : null;
}

async function openTicket(ticket: string) {
  const num = internalTicketNum(ticket);
  if (num === null || taskLoading.value) return;
  taskLoading.value = true;
  try {
    tasks.value ??= await tasksRepo.list(auth.uid!);
    const t = tasks.value.find((x) => x.num === num);
    if (!t) {
      toast.error(`Nessun ticket #${num} in Attività`);
      return;
    }
    taskDialogTask.value = t;
    taskDialogOpen.value = true;
  } catch (err) {
    toast.error('Impossibile aprire il ticket', { description: extractErrorMessage(err) });
  } finally {
    taskLoading.value = false;
  }
}

function onTaskSaved(t: Task) {
  const prev = tasks.value?.find((x) => x.id === t.id);
  if (tasks.value) tasks.value = tasks.value.map((x) => (x.id === t.id ? t : x));
  // The task dialog's "A statino" button can create an entry of its
  // own: refresh the grid when the save brought a new one.
  if (t.statinoEntryId && t.statinoEntryId !== prev?.statinoEntryId) void loadEntries();
}

const yearOptions = computed(() => {
  const current = now.getFullYear();
  const years = new Set<number>([current - 2, current - 1, current, current + 1]);
  return [...years].sort();
});
const monthOptions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

onMounted(async () => {
  try {
    [
      clients.value,
      contracts.value,
      projects.value,
      invoices.value,
      fiscalYears.value,
      taxRates.value,
    ] = await Promise.all([
      clientsRepo.list(auth.uid!),
      contractsRepo.list(auth.uid!),
      projectsRepo.list(auth.uid!),
      invoicesRepo.list(auth.uid!),
      fiscalYearsRepo.list(auth.uid!),
      taxRatesRepo.list(auth.uid!),
    ]);
    const last = localStorage.getItem(LAST_CLIENT_KEY);
    if (last && clients.value.some((c) => c.id === last)) {
      clientId.value = last;
    } else if (clients.value.length === 1) {
      clientId.value = clients.value[0].id;
    }
  } catch (err) {
    toast.error('Impossibile caricare le anagrafiche', {
      description: extractErrorMessage(err),
    });
  } finally {
    loadingCatalogs.value = false;
  }
  await loadEntries();
});

async function loadEntries() {
  loadingEntries.value = true;
  try {
    entries.value = await entriesRepo.listYear(auth.uid!, year.value);
  } catch (err) {
    toast.error('Impossibile caricare le ore', { description: extractErrorMessage(err) });
  } finally {
    loadingEntries.value = false;
  }
}

watch(year, () => {
  void loadEntries();
});

watch(clientId, (v) => {
  if (v) localStorage.setItem(LAST_CLIENT_KEY, v);
});

const contractById = computed(() => new Map(contracts.value.map((c) => [c.id, c])));
const projectById = computed(() => new Map(projects.value.map((p) => [p.id, p])));

const clientContracts = computed(() =>
  contracts.value.filter((c) => c.clientId === clientId.value),
);
const clientProjects = computed(() => projects.value.filter((p) => p.clientId === clientId.value));

const monthPrefix = computed(() => `${year.value}-${String(month.value).padStart(2, '0')}`);
const monthEnd = computed(() =>
  isoOf(year.value, month.value, daysInMonth(year.value, month.value)),
);

const clientYearEntries = computed(() =>
  entries.value.filter((e) => e.clientId === clientId.value),
);
const monthEntries = computed(() =>
  clientYearEntries.value.filter((e) => e.date.startsWith(monthPrefix.value)),
);

const entriesByDay = computed(() => {
  const map = new Map<string, Entry[]>();
  for (const e of monthEntries.value) {
    const list = map.get(e.date);
    if (list) {
      list.push(e);
    } else {
      map.set(e.date, [e]);
    }
  }
  return map;
});

interface DayRow {
  iso: string;
  dayLabel: string;
  weekday: string;
  weekdayShort: string;
  weekend: boolean;
  isToday: boolean;
  entries: Entry[];
  hours: number;
}

const days = computed<DayRow[]>(() => {
  const today = todayIso();
  const total = daysInMonth(year.value, month.value);
  const rows: DayRow[] = [];
  for (let d = 1; d <= total; d++) {
    const iso = isoOf(year.value, month.value, d);
    const dayEntries = entriesByDay.value.get(iso) ?? [];
    rows.push({
      iso,
      dayLabel: String(d).padStart(2, '0'),
      weekday: weekdayName(iso),
      weekdayShort: weekdayShortName(iso),
      weekend: isWeekend(iso),
      isToday: iso === today,
      entries: dayEntries,
      hours: dayEntries.reduce((sum, e) => sum + e.hours, 0),
    });
  }
  return rows;
});

const totalMonthHours = computed(() => monthEntries.value.reduce((sum, e) => sum + e.hours, 0));
const totalMonthAmount = computed(() =>
  monthEntries.value.reduce(
    (sum, e) => sum + e.hours * (contractById.value.get(e.contractId)?.hourlyRate ?? 0),
    0,
  ),
);

const NO_PROJECT = 'Senza progetto';

// Ore del mese suddivise per progetto, sotto il totale della card del
// cliente. Come nel recap del PDF: dal più grande, "Senza progetto" in
// fondo, e niente elenco se nessuna attività del mese ha un progetto
// (ripeterebbe soltanto il totale).
interface ProjectHours {
  key: string;
  project: Project | null;
  name: string;
  hours: number;
}

const monthProjectHours = computed<ProjectHours[]>(() => {
  const byProject = new Map<string, number>();
  let anyProject = false;
  for (const e of monthEntries.value) {
    if (e.projectId) anyProject = true;
    const key = e.projectId ?? '';
    byProject.set(key, (byProject.get(key) ?? 0) + e.hours);
  }
  if (!anyProject) return [];
  return [...byProject.entries()]
    .map(([key, hours]) => {
      const project = key ? (projectById.value.get(key) ?? null) : null;
      return { key, project, name: key ? (project?.name ?? '—') : NO_PROJECT, hours };
    })
    .sort((a, b) => {
      if (!a.key) return 1;
      if (!b.key) return -1;
      return b.hours - a.hours;
    });
});

const yearStart = computed(() => `${year.value}-01-01`);

// "Fatturabile": every activity of the year up to the selected month at
// its contract rate, whether already invoiced or not.
function billableAmount(ents: Entry[]): number {
  return ents
    .filter((e) => e.date <= monthEnd.value)
    .reduce((sum, e) => sum + e.hours * (contractById.value.get(e.contractId)?.hourlyRate ?? 0), 0);
}

const clientBillable = computed(() => billableAmount(clientYearEntries.value));
const allBillable = computed(() => billableAmount(entries.value));
const hasFiscalConfig = computed(() => fiscalYears.value.some((f) => f.year === year.value));

// "Fatturato" of the year up to the selected month, by issue date
// (older invoices without one fall back to the billed period's end).
function invoicedAmount(invs: Invoice[]): number {
  return invs
    .filter((i) => {
      const ref = i.date ?? i.dateTo;
      return ref >= yearStart.value && ref <= monthEnd.value;
    })
    .reduce((sum, i) => sum + i.amount, 0);
}

// "Incassato": what counts is the collection date, wherever the billed
// period falls (the intermediary decides amounts and timing).
function collectedAmount(invs: Invoice[]): number {
  return invs
    .filter(
      (i) => i.payment && i.payment.date >= yearStart.value && i.payment.date <= monthEnd.value,
    )
    .reduce((sum, i) => sum + (i.payment?.amount ?? 0), 0);
}

const netOf = (gross: number) => computeNet(gross, year.value, fiscalYears.value, taxRates.value);

// Netto previsto on the month's billable amount. Exact with flat rates;
// with progressive brackets it's the month taken in isolation.
const monthNet = computed(() => netOf(totalMonthAmount.value));

// Month totals across every client, not just the selected one.
const allMonthEntries = computed(() =>
  entries.value.filter((e) => e.date.startsWith(monthPrefix.value)),
);
const allMonthHours = computed(() => allMonthEntries.value.reduce((sum, e) => sum + e.hours, 0));
const allMonthAmount = computed(() =>
  allMonthEntries.value.reduce(
    (sum, e) => sum + e.hours * (contractById.value.get(e.contractId)?.hourlyRate ?? 0),
    0,
  ),
);
const allMonthNet = computed(() => netOf(allMonthAmount.value));

const clientInvoices = computed(() => invoices.value.filter((i) => i.clientId === clientId.value));
const clientInvoiced = computed(() => invoicedAmount(clientInvoices.value));
const clientCollected = computed(() => collectedAmount(clientInvoices.value));
// Net on what was actually collected, not on what was invoiced.
const clientNet = computed(() => netOf(clientCollected.value));

const allInvoiced = computed(() => invoicedAmount(invoices.value));
const allCollected = computed(() => collectedAmount(invoices.value));
const allNet = computed(() => netOf(allCollected.value));

const clientName = computed(() => clients.value.find((c) => c.id === clientId.value)?.name ?? '');

interface ContractSummary {
  contract: Contract;
  yearHours: number;
  monthHours: number;
  remaining: number;
}

// Contracts of the client that overlap the selected calendar year, with
// hours counted from January 1st up to the end of the selected month.
const contractSummaries = computed<ContractSummary[]>(() =>
  clientContracts.value
    .filter((c) => c.startDate <= `${year.value}-12-31` && c.endDate >= `${year.value}-01-01`)
    .map((c) => {
      const yearHours = clientYearEntries.value
        .filter((e) => e.contractId === c.id && e.date <= monthEnd.value)
        .reduce((sum, e) => sum + e.hours, 0);
      const monthHours = monthEntries.value
        .filter((e) => e.contractId === c.id)
        .reduce((sum, e) => sum + e.hours, 0);
      return { contract: c, yearHours, monthHours, remaining: c.annualHours - yearHours };
    })
    .sort((a, b) => a.contract.activity.localeCompare(b.contract.activity)),
);

function activeContractsFor(dateIso: string): Contract[] {
  return clientContracts.value.filter((c) => c.startDate <= dateIso && c.endDate >= dateIso);
}

// Contracts selectable in the dialog: the ones active on the target day,
// plus (in edit mode) the entry's own contract even if no longer active.
const entryFormContracts = computed<Contract[]>(() => {
  const date =
    entryFormMode.value === 'edit' && entryFormEntry.value
      ? entryFormEntry.value.date
      : entryFormDate.value;
  const active = activeContractsFor(date);
  const current = entryFormEntry.value
    ? contractById.value.get(entryFormEntry.value.contractId)
    : undefined;
  if (current && !active.some((c) => c.id === current.id)) {
    return [current, ...active];
  }
  return active;
});

function openAddEntry(dateIso: string) {
  if (!activeContractsFor(dateIso).length) {
    toast.info('Nessun contratto attivo in questa data', {
      description: 'Crea prima un contratto valido per questo giorno.',
    });
    return;
  }
  entryFormMode.value = 'create';
  entryFormEntry.value = null;
  entryFormDate.value = dateIso;
  entryFormOpen.value = true;
}

function openEditEntry(e: Entry) {
  entryFormMode.value = 'edit';
  entryFormEntry.value = e;
  entryFormDate.value = e.date;
  entryFormOpen.value = true;
}

function onEntrySaved(e: Entry) {
  const idx = entries.value.findIndex((x) => x.id === e.id);
  if (idx >= 0) {
    entries.value[idx] = e;
  } else {
    entries.value = [...entries.value, e];
  }
  entries.value = [...entries.value].sort((a, b) => a.date.localeCompare(b.date));
}

function askDeleteEntry(e: Entry) {
  if (e.invoiceId) {
    toast.info('Attività fatturata', {
      description: 'È conteggiata in una fattura: elimina prima la fattura per sbloccarla.',
    });
    return;
  }
  deleteTarget.value = e;
  deleteOpen.value = true;
}

async function confirmDeleteEntry() {
  if (!deleteTarget.value) return;
  deleteSubmitting.value = true;
  const e = deleteTarget.value;
  try {
    await entriesRepo.remove(auth.uid!, e.id);
    entries.value = entries.value.filter((x) => x.id !== e.id);
    toast.success('Attività eliminata');
    deleteOpen.value = false;
    deleteTarget.value = null;
  } catch (err) {
    toast.error("Impossibile eliminare l'attività", { description: extractErrorMessage(err) });
  } finally {
    deleteSubmitting.value = false;
  }
}

const loading = computed(() => loadingCatalogs.value || loadingEntries.value);

// PDF of the month grid (only what the client may see: no rates, no
// amounts) to attach to the invoice email.
const exporting = ref(false);

function entryPdfText(e: Entry): string {
  const parts = [contractById.value.get(e.contractId)?.activity ?? '—'];
  const project = e.projectId ? projectById.value.get(e.projectId)?.name : null;
  if (project) parts.push(project);
  const ticket = e.ticket || (e.link ? 'link' : '');
  if (ticket) parts.push(ticket);
  const head = parts.join(' · ');
  return e.description ? `${head} — ${e.description}` : head;
}

// Hours per project for the month, so the client can charge them to its
// cost centres: la stessa suddivisione della card laterale, con le ore
// già formattate (vuota quando nessuna attività del mese ha un progetto).
function monthProjectTotals(): { name: string; hours: string }[] {
  return monthProjectHours.value.map((p) => ({ name: p.name, hours: formatHours(p.hours) }));
}

// Suffisso nel nome file: tre varianti dello stesso mese non devono
// sovrascriversi a vicenda nella cartella dei download.
const PDF_MODES: { mode: StatinoPdfMode; label: string; suffix: string }[] = [
  { mode: 'completo', label: 'Statino completo', suffix: '' },
  { mode: 'statino', label: 'Solo statino', suffix: '-statino' },
  { mode: 'totali', label: 'Solo totali', suffix: '-totali' },
];

async function exportPdf(mode: StatinoPdfMode) {
  if (!clientId.value) return;
  exporting.value = true;
  try {
    const slug = clientName.value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const suffix = PDF_MODES.find((m) => m.mode === mode)?.suffix ?? '';
    await exportStatinoPdf({
      mode,
      clientName: clientName.value,
      periodLabel: `${monthName(month.value)} ${year.value}`,
      totalHours: formatHours(totalMonthHours.value),
      projectTotals: monthProjectTotals(),
      fileName: `statino-${slug}-${monthPrefix.value}${suffix}.pdf`,
      days: days.value.map((d) => ({
        label: `${d.dayLabel} ${d.weekdayShort}`,
        weekend: d.weekend,
        entries: d.entries.map((e) => ({
          text: entryPdfText(e),
          link: e.link || null,
          hours: formatHours(e.hours),
        })),
      })),
    });
  } catch (err) {
    toast.error('Impossibile esportare il PDF', { description: extractErrorMessage(err) });
  } finally {
    exporting.value = false;
  }
}

// The mobile FAB adds hours to today, so it only makes sense while the
// grid is showing the current month.
const viewingCurrentMonth = computed(
  () => year.value === now.getFullYear() && month.value === now.getMonth() + 1,
);

// On the phone the current day can be 20+ rows down: once entries are in,
// bring today into view instead of forcing a scroll past the whole month.
watch(loading, async (isLoading) => {
  if (isLoading || !clientId.value || !viewingCurrentMonth.value) return;
  if (!window.matchMedia('(max-width: 767px)').matches) return;
  await nextTick();
  document.querySelector('[data-today]')?.scrollIntoView({ block: 'center' });
});
</script>

<template>
  <div class="space-y-6 pb-20 md:pb-0">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Statino</h1>
        <p class="text-sm text-muted-foreground">Ore giornaliere per cliente e contratto.</p>
      </div>
      <div class="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
        <Select v-model="year">
          <SelectTrigger class="w-full sm:w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="y in yearOptions" :key="y" :value="y">{{ y }}</SelectItem>
          </SelectContent>
        </Select>
        <Select v-model="month">
          <SelectTrigger class="w-full sm:w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="m in monthOptions" :key="m" :value="m">
              {{ monthName(m) }}
            </SelectItem>
          </SelectContent>
        </Select>
        <Select v-model="clientId">
          <SelectTrigger class="col-span-2 w-full sm:col-span-1 sm:w-52">
            <SelectValue placeholder="Seleziona un cliente" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="c in clients" :key="c.id" :value="c.id">{{ c.name }}</SelectItem>
          </SelectContent>
        </Select>
        <DropdownMenu v-if="clientId">
          <DropdownMenuTrigger as-child>
            <Button
              variant="outline"
              class="col-span-2 sm:col-span-1"
              :disabled="loading || exporting"
            >
              <FileDown class="size-3.5" />
              {{ exporting ? 'Esportazione…' : 'Esporta PDF' }}
              <ChevronDown class="size-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem v-for="m in PDF_MODES" :key="m.mode" @select="exportPdf(m.mode)">
              {{ m.label }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>

    <div v-if="loading" class="space-y-2">
      <Skeleton class="h-9 w-full" />
      <Skeleton class="h-9 w-full" />
      <Skeleton class="h-9 w-full" />
      <Skeleton class="h-9 w-full" />
    </div>

    <div
      v-else-if="!clients.length"
      class="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground"
    >
      Nessun cliente in anagrafica.
      <RouterLink to="/clients" class="font-medium text-foreground underline">
        Crea il primo cliente
      </RouterLink>
      per iniziare.
    </div>

    <div
      v-else-if="!clientId"
      class="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground"
    >
      Seleziona un cliente per vedere lo statino.
    </div>

    <div v-else class="flex flex-col gap-6 xl:flex-row xl:items-start">
      <div class="min-w-0 flex-1 overflow-x-auto rounded-lg border">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <th class="w-20 px-2 py-2 font-medium sm:w-36 sm:px-3">Giorno</th>
              <th class="px-2 py-2 font-medium sm:px-3">Attività</th>
              <th class="w-12 px-2 py-2 text-right font-medium sm:w-16 sm:px-3">Ore</th>
              <th class="w-10 px-1 py-2" />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="day in days"
              :key="day.iso"
              class="border-b last:border-b-0"
              :class="[
                day.weekend ? 'bg-rose-50 dark:bg-rose-950/30' : '',
                day.isToday ? 'ring-2 ring-inset ring-primary/30' : '',
              ]"
              :data-today="day.isToday ? '' : undefined"
            >
              <td class="whitespace-nowrap px-2 py-1.5 align-top sm:px-3">
                <span class="font-medium tabular-nums">{{ day.dayLabel }}</span>
                <span class="ml-1.5 text-xs text-muted-foreground sm:ml-2">
                  <span class="sm:hidden">{{ day.weekdayShort }}</span>
                  <span class="hidden sm:inline">{{ day.weekday }}</span>
                </span>
              </td>
              <td class="px-2 py-1.5 sm:px-3">
                <div v-if="day.entries.length" class="space-y-1">
                  <div
                    v-for="e in day.entries"
                    :key="e.id"
                    class="group flex flex-wrap items-center gap-x-2 gap-y-0.5"
                  >
                    <span
                      class="rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground"
                    >
                      {{ contractById.get(e.contractId)?.activity ?? '—' }}
                    </span>
                    <span
                      v-if="e.projectId"
                      :class="badgeClass(projectById.get(e.projectId))"
                      :style="badgeStyle(projectById.get(e.projectId))"
                    >
                      {{ projectById.get(e.projectId)?.name ?? '—' }}
                    </span>
                    <a
                      v-if="e.link"
                      :href="e.link"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="inline-flex items-center gap-0.5 text-xs font-medium text-primary underline-offset-2 hover:underline"
                    >
                      {{ e.ticket || 'link' }}
                      <ExternalLink class="size-3" />
                    </a>
                    <button
                      v-else-if="e.ticket && internalTicketNum(e.ticket) !== null"
                      type="button"
                      class="text-xs font-medium text-primary underline-offset-2 hover:underline"
                      @click="openTicket(e.ticket)"
                    >
                      {{ e.ticket }}
                    </button>
                    <span v-else-if="e.ticket" class="text-xs font-medium">{{ e.ticket }}</span>
                    <span v-if="e.description" class="text-xs text-muted-foreground">
                      {{ e.description }}
                    </span>
                    <span
                      v-if="day.entries.length > 1"
                      class="text-xs tabular-nums text-muted-foreground"
                    >
                      ({{ formatHours(e.hours) }} h)
                    </span>
                    <Lock
                      v-if="e.invoiceId"
                      class="size-3 text-muted-foreground"
                      aria-label="Attività fatturata"
                    />
                    <span
                      class="inline-flex transition-opacity pointer-fine:opacity-0 pointer-fine:group-focus-within:opacity-100 pointer-fine:group-hover:opacity-100"
                    >
                      <button
                        class="rounded p-0.5 text-muted-foreground hover:text-foreground pointer-coarse:p-2"
                        aria-label="Modifica attività"
                        @click="openEditEntry(e)"
                      >
                        <Pencil class="size-3 pointer-coarse:size-4" />
                      </button>
                      <button
                        v-if="!e.invoiceId"
                        class="rounded p-0.5 text-muted-foreground hover:text-destructive pointer-coarse:p-2"
                        aria-label="Elimina attività"
                        @click="askDeleteEntry(e)"
                      >
                        <Trash2 class="size-3 pointer-coarse:size-4" />
                      </button>
                    </span>
                  </div>
                </div>
              </td>
              <td class="px-2 py-1.5 text-right align-top tabular-nums sm:px-3">
                <span v-if="day.hours">{{ formatHours(day.hours) }}</span>
              </td>
              <td class="px-1 py-1 text-right align-top">
                <button
                  class="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground pointer-coarse:p-2.5"
                  aria-label="Aggiungi attività"
                  @click="openAddEntry(day.iso)"
                >
                  <Plus class="size-3.5 pointer-coarse:size-5" />
                </button>
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="border-t bg-muted/50 font-medium">
              <td class="px-3 py-2">TOTALE</td>
              <td />
              <td class="px-3 py-2 text-right tabular-nums">{{ formatHours(totalMonthHours) }}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <aside class="w-full shrink-0 space-y-4 xl:w-80">
        <Card>
          <CardHeader>
            <CardTitle class="text-base">Totale {{ clientName }}</CardTitle>
          </CardHeader>
          <CardContent class="space-y-1">
            <div class="flex items-baseline justify-between">
              <span class="text-sm text-muted-foreground">Ore</span>
              <span class="text-xl font-semibold tabular-nums">
                {{ formatHours(totalMonthHours) }}
              </span>
            </div>
            <ul v-if="monthProjectHours.length" class="space-y-1 pb-1 pl-3">
              <li v-for="p in monthProjectHours" :key="p.key" class="flex items-center gap-2">
                <span
                  v-if="p.project"
                  :class="[badgeClass(p.project), 'min-w-0 truncate']"
                  :style="badgeStyle(p.project)"
                  :title="p.name"
                >
                  {{ p.name }}
                </span>
                <span v-else class="min-w-0 truncate text-xs text-muted-foreground">
                  {{ p.name }}
                </span>
                <span class="ml-auto text-sm tabular-nums">{{ formatHours(p.hours) }}</span>
              </li>
            </ul>
            <div class="flex items-baseline justify-between">
              <span class="text-sm text-muted-foreground">Importo</span>
              <span class="text-xl font-semibold tabular-nums">
                {{ formatEur(totalMonthAmount) }}
              </span>
            </div>
            <div class="flex items-baseline justify-between">
              <span class="text-sm text-muted-foreground">Netto previsto</span>
              <span class="text-base font-medium tabular-nums">
                {{ monthNet ? formatEur(monthNet.net) : '—' }}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle class="text-base"> Totali {{ monthName(month) }} {{ year }} </CardTitle>
          </CardHeader>
          <CardContent class="space-y-1">
            <p class="pb-1 text-xs text-muted-foreground">Tutti i clienti nel mese.</p>
            <div class="flex items-baseline justify-between">
              <span class="text-sm text-muted-foreground">Ore</span>
              <span class="text-xl font-semibold tabular-nums">
                {{ formatHours(allMonthHours) }}
              </span>
            </div>
            <div class="flex items-baseline justify-between">
              <span class="text-sm text-muted-foreground">Importo</span>
              <span class="text-xl font-semibold tabular-nums">
                {{ formatEur(allMonthAmount) }}
              </span>
            </div>
            <div class="flex items-baseline justify-between">
              <span class="text-sm text-muted-foreground">Netto previsto</span>
              <span class="text-base font-medium tabular-nums">
                {{ allMonthNet ? formatEur(allMonthNet.net) : '—' }}
              </span>
            </div>
            <p v-if="!hasFiscalConfig" class="pt-1 text-xs text-muted-foreground">
              Per il netto configura i
              <RouterLink to="/settings" class="underline">dati fiscali</RouterLink>
              del {{ year }}.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle class="text-base">Contratti {{ year }}</CardTitle>
          </CardHeader>
          <CardContent class="space-y-4">
            <p v-if="!contractSummaries.length" class="text-sm text-muted-foreground">
              Nessun contratto per questo cliente nell'anno selezionato.
            </p>
            <div
              v-for="s in contractSummaries"
              :key="s.contract.id"
              class="space-y-1.5 border-b pb-3 last:border-b-0 last:pb-0"
            >
              <div class="flex items-baseline justify-between gap-2">
                <span class="text-sm font-medium">{{ s.contract.activity }}</span>
                <span class="text-xs text-muted-foreground">
                  {{ formatEur(s.contract.hourlyRate) }}/h
                </span>
              </div>
              <div class="h-1.5 overflow-hidden rounded-full bg-secondary">
                <div
                  class="h-full rounded-full"
                  :class="s.remaining < 0 ? 'bg-destructive' : 'bg-primary'"
                  :style="{
                    width: `${Math.min(100, (s.yearHours / s.contract.annualHours) * 100)}%`,
                  }"
                />
              </div>
              <dl class="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                <div class="flex justify-between">
                  <dt class="text-muted-foreground">Annuali</dt>
                  <dd class="tabular-nums">{{ formatHours(s.contract.annualHours) }}</dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-muted-foreground">Fatte (anno)</dt>
                  <dd class="tabular-nums">{{ formatHours(s.yearHours) }}</dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-muted-foreground">Nel mese</dt>
                  <dd class="tabular-nums">{{ formatHours(s.monthHours) }}</dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-muted-foreground">Residue</dt>
                  <dd
                    class="font-medium tabular-nums"
                    :class="s.remaining < 0 ? 'text-destructive' : ''"
                  >
                    {{ formatHours(s.remaining) }}
                  </dd>
                </div>
              </dl>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle class="text-base">{{ clientName }} — anno {{ year }}</CardTitle>
          </CardHeader>
          <CardContent class="space-y-1">
            <p class="pb-1 text-xs text-muted-foreground">
              Fino a {{ monthName(month) }}; l'incassato conta per data di incasso.
            </p>
            <div class="flex items-baseline justify-between">
              <span class="text-sm text-muted-foreground">Fatturabile</span>
              <span class="text-base font-medium tabular-nums">
                {{ formatEur(clientBillable) }}
              </span>
            </div>
            <div class="flex items-baseline justify-between">
              <span class="text-sm text-muted-foreground">Fatturato</span>
              <span class="text-base font-medium tabular-nums">
                {{ formatEur(clientInvoiced) }}
              </span>
            </div>
            <div class="flex items-baseline justify-between">
              <span class="text-sm text-muted-foreground">Incassato</span>
              <span class="text-base font-medium tabular-nums">
                {{ formatEur(clientCollected) }}
              </span>
            </div>
            <div class="flex items-baseline justify-between">
              <span class="text-sm text-muted-foreground">Netto (su incassato)</span>
              <span class="text-base font-semibold tabular-nums">
                {{ clientNet ? formatEur(clientNet.net) : '—' }}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle class="text-base">Tutti i clienti — anno {{ year }}</CardTitle>
          </CardHeader>
          <CardContent class="space-y-1">
            <p class="pb-1 text-xs text-muted-foreground">
              Fino a {{ monthName(month) }}; l'incassato conta per data di incasso.
            </p>
            <div class="flex items-baseline justify-between">
              <span class="text-sm text-muted-foreground">Fatturabile</span>
              <span class="text-base font-medium tabular-nums">{{ formatEur(allBillable) }}</span>
            </div>
            <div class="flex items-baseline justify-between">
              <span class="text-sm text-muted-foreground">Fatturato</span>
              <span class="text-base font-medium tabular-nums">{{ formatEur(allInvoiced) }}</span>
            </div>
            <div class="flex items-baseline justify-between">
              <span class="text-sm text-muted-foreground">Incassato</span>
              <span class="text-base font-medium tabular-nums">{{ formatEur(allCollected) }}</span>
            </div>
            <div class="flex items-baseline justify-between">
              <span class="text-sm text-muted-foreground">Netto (su incassato)</span>
              <span class="text-base font-semibold tabular-nums">
                {{ allNet ? formatEur(allNet.net) : '—' }}
              </span>
            </div>
          </CardContent>
        </Card>
      </aside>
    </div>

    <button
      v-if="!loading && clientId && viewingCurrentMonth"
      class="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-4 z-30 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95 md:hidden"
      aria-label="Aggiungi attività per oggi"
      @click="openAddEntry(todayIso())"
    >
      <Plus class="size-6" />
    </button>

    <EntryFormDialog
      v-model:open="entryFormOpen"
      :mode="entryFormMode"
      :entry="entryFormEntry"
      :date="entryFormDate"
      :client-id="clientId"
      :contracts="entryFormContracts"
      :projects="clientProjects"
      @saved="onEntrySaved"
    />

    <TaskFormDialog
      v-model:open="taskDialogOpen"
      mode="edit"
      :task="taskDialogTask"
      :clients="clients"
      :tasks="tasks ?? []"
      @saved="onTaskSaved"
    />

    <Dialog v-model:open="deleteOpen">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Eliminare l'attività?</DialogTitle>
          <DialogDescription>
            <template v-if="deleteTarget">
              {{ formatHours(deleteTarget.hours) }} h del
              {{ formatDate(deleteTarget.date) }}
              <template v-if="deleteTarget.description">
                — “{{ deleteTarget.description }}”
              </template>
            </template>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            :disabled="deleteSubmitting"
            @click="deleteOpen = false"
          >
            Annulla
          </Button>
          <Button
            variant="destructive"
            size="sm"
            :disabled="deleteSubmitting"
            @click="confirmDeleteEntry"
          >
            {{ deleteSubmitting ? 'Eliminazione…' : 'Elimina' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
