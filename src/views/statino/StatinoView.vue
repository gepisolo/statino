<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { toast } from 'vue-sonner';
import { ExternalLink, Pencil, Plus, Trash2 } from '@lucide/vue';
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
import {
  clientsRepo,
  contractsRepo,
  entriesRepo,
  projectsRepo,
  extractErrorMessage,
} from '@/lib/db';
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
} from '@/lib/format';
import { useAuthStore } from '@/stores/auth';
import type { Client, Contract, Entry, Project } from '@/types/models';

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

const yearOptions = computed(() => {
  const current = now.getFullYear();
  const years = new Set<number>([current - 2, current - 1, current, current + 1]);
  return [...years].sort();
});
const monthOptions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

onMounted(async () => {
  try {
    [clients.value, contracts.value, projects.value] = await Promise.all([
      clientsRepo.list(auth.uid!),
      contractsRepo.list(auth.uid!),
      projectsRepo.list(auth.uid!),
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
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Statino</h1>
        <p class="text-sm text-muted-foreground">Ore giornaliere per cliente e contratto.</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <Select v-model="year">
          <SelectTrigger class="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="y in yearOptions" :key="y" :value="y">{{ y }}</SelectItem>
          </SelectContent>
        </Select>
        <Select v-model="month">
          <SelectTrigger class="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="m in monthOptions" :key="m" :value="m">
              {{ monthName(m) }}
            </SelectItem>
          </SelectContent>
        </Select>
        <Select v-model="clientId">
          <SelectTrigger class="w-52">
            <SelectValue placeholder="Seleziona un cliente" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="c in clients" :key="c.id" :value="c.id">{{ c.name }}</SelectItem>
          </SelectContent>
        </Select>
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
              <th class="w-36 px-3 py-2 font-medium">Giorno</th>
              <th class="px-3 py-2 font-medium">Attività</th>
              <th class="w-16 px-3 py-2 text-right font-medium">Ore</th>
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
            >
              <td class="whitespace-nowrap px-3 py-1.5 align-top">
                <span class="font-medium tabular-nums">{{ day.dayLabel }}</span>
                <span class="ml-2 text-xs text-muted-foreground">{{ day.weekday }}</span>
              </td>
              <td class="px-3 py-1.5">
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
                      class="rounded bg-accent px-1.5 py-0.5 text-xs text-accent-foreground"
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
                    <span v-else-if="e.ticket" class="text-xs font-medium">{{ e.ticket }}</span>
                    <span v-if="e.description" class="text-xs text-muted-foreground">
                      {{ e.description }}
                    </span>
                    <span class="text-xs tabular-nums text-muted-foreground">
                      ({{ formatHours(e.hours) }} h)
                    </span>
                    <span class="inline-flex opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        class="rounded p-0.5 text-muted-foreground hover:text-foreground"
                        aria-label="Modifica attività"
                        @click="openEditEntry(e)"
                      >
                        <Pencil class="size-3" />
                      </button>
                      <button
                        class="rounded p-0.5 text-muted-foreground hover:text-destructive"
                        aria-label="Elimina attività"
                        @click="askDeleteEntry(e)"
                      >
                        <Trash2 class="size-3" />
                      </button>
                    </span>
                  </div>
                </div>
              </td>
              <td class="px-3 py-1.5 text-right align-top tabular-nums">
                <span v-if="day.hours">{{ formatHours(day.hours) }}</span>
              </td>
              <td class="px-1 py-1 text-right align-top">
                <button
                  class="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  aria-label="Aggiungi attività"
                  @click="openAddEntry(day.iso)"
                >
                  <Plus class="size-3.5" />
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
            <CardTitle class="text-base"> Totali {{ monthName(month) }} {{ year }} </CardTitle>
          </CardHeader>
          <CardContent class="space-y-1">
            <div class="flex items-baseline justify-between">
              <span class="text-sm text-muted-foreground">Ore</span>
              <span class="text-xl font-semibold tabular-nums">
                {{ formatHours(totalMonthHours) }}
              </span>
            </div>
            <div class="flex items-baseline justify-between">
              <span class="text-sm text-muted-foreground">Importo</span>
              <span class="text-xl font-semibold tabular-nums">
                {{ formatEur(totalMonthAmount) }}
              </span>
            </div>
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
      </aside>
    </div>

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
