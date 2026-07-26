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
import {
  clientsRepo,
  contractsRepo,
  entriesRepo,
  invoicesRepo,
  extractErrorMessage,
} from '@/lib/db';
import { formatEur, formatHours } from '@/lib/format';
import { periodTotals, yearRange, type PeriodTotals } from '@/lib/stats';
import { useAuthStore } from '@/stores/auth';
import type { Client, Contract, Entry, Invoice } from '@/types/models';

const auth = useAuthStore();

const now = new Date();
const year = ref(now.getFullYear());

const loadingCatalogs = ref(true);
const loadingEntries = ref(true);
const clients = ref<Client[]>([]);
const contracts = ref<Contract[]>([]);
const invoices = ref<Invoice[]>([]);
const entries = ref<Entry[]>([]);

const yearOptions = computed(() => {
  const current = now.getFullYear();
  return [current - 2, current - 1, current, current + 1];
});

onMounted(async () => {
  try {
    [clients.value, contracts.value, invoices.value] = await Promise.all([
      clientsRepo.list(auth.uid!),
      contractsRepo.list(auth.uid!),
      invoicesRepo.list(auth.uid!),
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

interface ClientRow extends PeriodTotals {
  client: Client;
}

// One row per client with activity or invoices in the year, busiest
// first.
const rows = computed<ClientRow[]>(() => {
  const [from, to] = yearRange(year.value);
  return clients.value
    .map((client) => ({
      client,
      ...periodTotals(
        entries.value.filter((e) => e.clientId === client.id),
        invoices.value.filter((i) => i.clientId === client.id),
        rates.value,
        from,
        to,
      ),
    }))
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
              <TableRow v-for="r in rows" :key="r.client.id">
                <TableCell class="font-medium">{{ r.client.name }}</TableCell>
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
                <TableCell class="text-right tabular-nums">{{ formatEur(r.collected) }}</TableCell>
              </TableRow>
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
        </CardContent>
      </Card>
    </template>
  </div>
</template>
