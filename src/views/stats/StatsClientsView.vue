<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { toast } from 'vue-sonner';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import BarChart from '@/components/stats/BarChart.vue';
import { ChevronRight } from '@lucide/vue';
import {
  clientsRepo,
  contractsRepo,
  entriesRepo,
  invoicesRepo,
  projectsRepo,
  extractErrorMessage,
} from '@/lib/db';
import { badgeClass, badgeStyle } from '@/lib/colors';
import { formatEur, formatHours } from '@/lib/format';
import { periodTotals, yearRange, type PeriodTotals } from '@/lib/stats';
import { useAuthStore } from '@/stores/auth';
import type { Client, Contract, Entry, Invoice, Project } from '@/types/models';

const auth = useAuthStore();

const now = new Date();
const year = ref(now.getFullYear());

const loadingCatalogs = ref(true);
const loadingEntries = ref(true);
const clients = ref<Client[]>([]);
const contracts = ref<Contract[]>([]);
const invoices = ref<Invoice[]>([]);
const projects = ref<Project[]>([]);
const entries = ref<Entry[]>([]);

const yearOptions = computed(() => {
  const current = now.getFullYear();
  return [current - 2, current - 1, current, current + 1];
});

onMounted(async () => {
  try {
    [clients.value, contracts.value, invoices.value, projects.value] = await Promise.all([
      clientsRepo.list(auth.uid!),
      contractsRepo.list(auth.uid!),
      invoicesRepo.list(auth.uid!),
      projectsRepo.list(auth.uid!),
    ]);
  } catch (err) {
    toast.error('Impossibile caricare i dati', { description: extractErrorMessage(err) });
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

const loading = computed(() => loadingCatalogs.value || loadingEntries.value);

const rates = computed(() => new Map(contracts.value.map((c) => [c.id, c.hourlyRate])));

const projectById = computed(() => new Map(projects.value.map((p) => [p.id, p])));

// Breakdown under a client row. Only hours and billable can be split by
// project: both come from the entries. Invoices (and their payments)
// have no project, so "fatturato" and "incassato" stay client-level —
// splitting them would mean inventing a share.
const NO_PROJECT = 'Senza progetto';

interface ProjectRow {
  key: string; // project id, '' for the unassigned bucket
  name: string;
  project: Project | null; // carries the badge colors
  hours: number;
  billable: number;
}

function projectRows(clientEntries: Entry[], from: string, to: string): ProjectRow[] {
  const byKey = new Map<string, ProjectRow>();
  for (const e of clientEntries) {
    if (e.date < from || e.date > to) continue;
    const key = e.projectId ?? '';
    const project = e.projectId ? (projectById.value.get(e.projectId) ?? null) : null;
    const row = byKey.get(key) ?? {
      key,
      name: project?.name ?? (e.projectId ? '—' : NO_PROJECT),
      project,
      hours: 0,
      billable: 0,
    };
    row.hours += e.hours;
    row.billable += e.hours * (rates.value.get(e.contractId) ?? 0);
    byKey.set(key, row);
  }
  // Biggest first, unassigned hours last.
  return [...byKey.values()].sort((a, b) => {
    if (a.key === '') return 1;
    if (b.key === '') return -1;
    return b.billable - a.billable;
  });
}

interface ClientRow extends PeriodTotals {
  client: Client;
  projects: ProjectRow[];
}

// One row per client with activity or invoices in the year, busiest
// first.
const rows = computed<ClientRow[]>(() => {
  const [from, to] = yearRange(year.value);
  return clients.value
    .map((client) => {
      const clientEntries = entries.value.filter((e) => e.clientId === client.id);
      return {
        client,
        projects: projectRows(clientEntries, from, to),
        ...periodTotals(
          clientEntries,
          invoices.value.filter((i) => i.clientId === client.id),
          rates.value,
          from,
          to,
        ),
      };
    })
    .filter((r) => r.hours > 0 || r.invoiced > 0 || r.collected > 0)
    .sort((a, b) => b.billable - a.billable);
});

const totals = computed(() =>
  rows.value.reduce(
    (acc, r) => ({
      hours: acc.hours + r.hours,
      billable: acc.billable + r.billable,
      invoiced: acc.invoiced + r.invoiced,
      collected: acc.collected + r.collected,
    }),
    { hours: 0, billable: 0, invoiced: 0, collected: 0 },
  ),
);

const clientLabels = computed(() => rows.value.map((r) => r.client.name));
const hoursSeries = computed(() => [{ name: 'Ore', values: rows.value.map((r) => r.hours) }]);
const eurSeries = computed(() => [
  { name: 'Fatturabile', values: rows.value.map((r) => r.billable) },
  { name: 'Fatturato', values: rows.value.map((r) => r.invoiced) },
  { name: 'Incassato', values: rows.value.map((r) => r.collected) },
]);

function eurTick(n: number): string {
  return n >= 1000 ? `${formatHours(n / 1000)}k` : String(Math.round(n));
}

function share(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0;
}

// Expanding a client shows its projects. Shares stay measured against
// the grand total, so the project rows add up to their client's own.
const expanded = ref(new Set<string>());

function expandable(r: ClientRow): boolean {
  return r.projects.some((p) => p.key !== '');
}

function toggle(clientId: string) {
  const next = new Set(expanded.value);
  if (!next.delete(clientId)) next.add(clientId);
  expanded.value = next;
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Statistiche per cliente</h1>
        <p class="text-sm text-muted-foreground">
          Come si distribuisce l'anno tra i clienti: ore, importi e quote.
        </p>
      </div>
      <Select v-model="year">
        <SelectTrigger class="w-28">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="y in yearOptions" :key="y" :value="y">{{ y }}</SelectItem>
        </SelectContent>
      </Select>
    </div>

    <div v-if="loading" class="space-y-2">
      <Skeleton class="h-64 w-full" />
      <Skeleton class="h-40 w-full" />
    </div>

    <p v-else-if="!rows.length" class="text-sm text-muted-foreground">
      Nessuna attività o fattura nel {{ year }}.
    </p>

    <template v-else>
      <div class="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle class="text-base">Ore per cliente</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart
              :labels="clientLabels"
              :series="hoursSeries"
              :format-value="(n) => `${formatHours(n)} h`"
              :format-tick="formatHours"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle class="text-base">Euro per cliente</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart
              :labels="clientLabels"
              :series="eurSeries"
              :format-value="formatEur"
              :format-tick="eurTick"
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle class="text-base">Dettaglio per cliente</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead class="text-right">Ore</TableHead>
                <TableHead class="w-40">Quota ore</TableHead>
                <TableHead class="text-right">Fatturabile</TableHead>
                <TableHead class="text-right">Fatturato</TableHead>
                <TableHead class="text-right">Incassato</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <template v-for="r in rows" :key="r.client.id">
                <TableRow>
                  <TableCell class="font-medium">
                    <button
                      v-if="expandable(r)"
                      type="button"
                      class="flex cursor-pointer items-center gap-1.5 rounded-sm text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      :aria-expanded="expanded.has(r.client.id)"
                      :title="
                        expanded.has(r.client.id) ? 'Nascondi i progetti' : 'Mostra i progetti'
                      "
                      @click="toggle(r.client.id)"
                    >
                      <ChevronRight
                        class="size-3.5 shrink-0 text-muted-foreground transition-transform"
                        :class="expanded.has(r.client.id) && 'rotate-90'"
                      />
                      {{ r.client.name }}
                    </button>
                    <span v-else class="pl-5">{{ r.client.name }}</span>
                  </TableCell>
                  <TableCell class="text-right tabular-nums">{{ formatHours(r.hours) }}</TableCell>
                  <TableCell>
                    <div class="flex items-center gap-2">
                      <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                        <div
                          class="h-full rounded-full bg-primary"
                          :style="{ width: `${share(r.hours, totals.hours)}%` }"
                        />
                      </div>
                      <span class="w-9 text-right text-xs tabular-nums text-muted-foreground">
                        {{ Math.round(share(r.hours, totals.hours)) }}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell class="text-right tabular-nums">{{ formatEur(r.billable) }}</TableCell>
                  <TableCell class="text-right tabular-nums">{{ formatEur(r.invoiced) }}</TableCell>
                  <TableCell class="text-right tabular-nums">{{
                    formatEur(r.collected)
                  }}</TableCell>
                </TableRow>
                <TableRow
                  v-for="p in expanded.has(r.client.id) ? r.projects : []"
                  :key="`${r.client.id}-${p.key}`"
                  class="bg-muted/40"
                >
                  <TableCell class="pl-10">
                    <span
                      v-if="p.project"
                      :class="badgeClass(p.project)"
                      :style="badgeStyle(p.project)"
                    >
                      {{ p.name }}
                    </span>
                    <span v-else class="text-muted-foreground">{{ p.name }}</span>
                  </TableCell>
                  <TableCell class="text-right tabular-nums text-muted-foreground">
                    {{ formatHours(p.hours) }}
                  </TableCell>
                  <TableCell>
                    <div class="flex items-center gap-2">
                      <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                        <div
                          class="h-full rounded-full bg-primary/50"
                          :style="{ width: `${share(p.hours, totals.hours)}%` }"
                        />
                      </div>
                      <span class="w-9 text-right text-xs tabular-nums text-muted-foreground">
                        {{ Math.round(share(p.hours, totals.hours)) }}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell class="text-right tabular-nums text-muted-foreground">
                    {{ formatEur(p.billable) }}
                  </TableCell>
                  <TableCell
                    class="text-right text-muted-foreground"
                    title="Le fatture non sono legate a un progetto"
                  >
                    —
                  </TableCell>
                  <TableCell
                    class="text-right text-muted-foreground"
                    title="Gli incassi non sono legati a un progetto"
                  >
                    —
                  </TableCell>
                </TableRow>
              </template>
              <TableRow class="font-medium">
                <TableCell>Totale</TableCell>
                <TableCell class="text-right tabular-nums">{{
                  formatHours(totals.hours)
                }}</TableCell>
                <TableCell />
                <TableCell class="text-right tabular-nums">{{
                  formatEur(totals.billable)
                }}</TableCell>
                <TableCell class="text-right tabular-nums">{{
                  formatEur(totals.invoiced)
                }}</TableCell>
                <TableCell class="text-right tabular-nums">{{
                  formatEur(totals.collected)
                }}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <p class="mt-3 text-xs text-muted-foreground">
            Apri un cliente per vedere il dettaglio per progetto. Ore e fatturabile si ripartiscono
            tra i progetti perché arrivano dalle attività; fatturato e incassato restano solo sulla
            riga del cliente, perché fatture e incassi non sono legati a un progetto.
          </p>
        </CardContent>
      </Card>
    </template>
  </div>
</template>
