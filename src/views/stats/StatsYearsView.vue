<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { toast } from 'vue-sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  contractsRepo,
  entriesRepo,
  fiscalYearsRepo,
  invoicesRepo,
  taxRatesRepo,
  extractErrorMessage,
} from '@/lib/db';
import { formatEur, formatHours } from '@/lib/format';
import { elapsedMonths, invoiceRefDate, periodTotals, yearRange } from '@/lib/stats';
import { computeNet } from '@/lib/tax';
import { useAuthStore } from '@/stores/auth';
import type { Contract, Entry, FiscalYear, Invoice, TaxRate } from '@/types/models';

const auth = useAuthStore();

const now = new Date();
const loading = ref(true);
const contracts = ref<Contract[]>([]);
const invoices = ref<Invoice[]>([]);
const fiscalYears = ref<FiscalYear[]>([]);
const taxRates = ref<TaxRate[]>([]);
// The whole history: year comparison needs every year at once. Volumes
// are tiny (a few hundred entries per year).
const entries = ref<Entry[]>([]);

onMounted(async () => {
  try {
    [contracts.value, invoices.value, fiscalYears.value, taxRates.value, entries.value] =
      await Promise.all([
        contractsRepo.list(auth.uid!),
        invoicesRepo.list(auth.uid!),
        fiscalYearsRepo.list(auth.uid!),
        taxRatesRepo.list(auth.uid!),
        entriesRepo.list(auth.uid!),
      ]);
  } catch (err) {
    toast.error('Impossibile caricare i dati', { description: extractErrorMessage(err) });
  } finally {
    loading.value = false;
  }
});

const rates = computed(() => new Map(contracts.value.map((c) => [c.id, c.hourlyRate])));

const years = computed(() => {
  const set = new Set<number>();
  for (const e of entries.value) set.add(Number(e.date.slice(0, 4)));
  for (const i of invoices.value) {
    set.add(Number(invoiceRefDate(i).slice(0, 4)));
    if (i.payment) set.add(Number(i.payment.date.slice(0, 4)));
  }
  return [...set].sort();
});

interface YearRow {
  year: number;
  hours: number;
  billable: number;
  invoiced: number;
  collected: number;
  net: number | null;
  due: number | null;
  monthlyNet: number | null;
  // Billable delta vs the previous listed year, as a percentage.
  deltaBillable: number | null;
}

const rows = computed<YearRow[]>(() => {
  let prevBillable: number | null = null;
  return years.value.map((y) => {
    const [from, to] = yearRange(y);
    const t = periodTotals(entries.value, invoices.value, rates.value, from, to);
    const breakdown = computeNet(t.collected, y, fiscalYears.value, taxRates.value);
    const months = elapsedMonths(y, now);
    const row: YearRow = {
      year: y,
      ...t,
      net: breakdown?.net ?? null,
      due: breakdown?.due ?? null,
      monthlyNet: breakdown ? breakdown.net / months : null,
      deltaBillable:
        prevBillable && prevBillable > 0
          ? ((t.billable - prevBillable) / prevBillable) * 100
          : null,
    };
    prevBillable = t.billable;
    return row;
  });
});

const yearLabels = computed(() => rows.value.map((r) => String(r.year)));
const hoursSeries = computed(() => [{ name: 'Ore', values: rows.value.map((r) => r.hours) }]);
const eurSeries = computed(() => [
  { name: 'Fatturabile', values: rows.value.map((r) => r.billable) },
  { name: 'Fatturato', values: rows.value.map((r) => r.invoiced) },
  { name: 'Incassato', values: rows.value.map((r) => r.collected) },
]);

function eurTick(n: number): string {
  return n >= 1000 ? `${formatHours(n / 1000)}k` : String(Math.round(n));
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">Statistiche per anno</h1>
      <p class="text-sm text-muted-foreground">
        Gli anni a confronto; per l'anno in corso le medie usano i mesi trascorsi.
      </p>
    </div>

    <div v-if="loading" class="space-y-2">
      <Skeleton class="h-64 w-full" />
      <Skeleton class="h-40 w-full" />
    </div>

    <p v-else-if="!rows.length" class="text-sm text-muted-foreground">
      Nessun dato: aggiungi attività o fatture.
    </p>

    <template v-else>
      <div class="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle class="text-base">Ore per anno</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart
              :labels="yearLabels"
              :series="hoursSeries"
              :format-value="(n) => `${formatHours(n)} h`"
              :format-tick="formatHours"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle class="text-base">Euro per anno</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart
              :labels="yearLabels"
              :series="eurSeries"
              :format-value="formatEur"
              :format-tick="eurTick"
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle class="text-base">Anni a confronto</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Anno</TableHead>
                <TableHead class="text-right">Ore</TableHead>
                <TableHead class="text-right">Fatturabile</TableHead>
                <TableHead class="text-right">vs anno prec.</TableHead>
                <TableHead class="text-right">Fatturato</TableHead>
                <TableHead class="text-right">Incassato</TableHead>
                <TableHead class="text-right">Netto</TableHead>
                <TableHead class="text-right">Accantonato</TableHead>
                <TableHead class="text-right">Netto medio/mese</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="r in rows" :key="r.year">
                <TableCell class="font-medium tabular-nums">{{ r.year }}</TableCell>
                <TableCell class="text-right tabular-nums">{{ formatHours(r.hours) }}</TableCell>
                <TableCell class="text-right tabular-nums">{{ formatEur(r.billable) }}</TableCell>
                <TableCell
                  class="text-right tabular-nums"
                  :class="
                    r.deltaBillable === null
                      ? 'text-muted-foreground'
                      : r.deltaBillable >= 0
                        ? 'text-[#006300] dark:text-[#0ca30c]'
                        : 'text-destructive'
                  "
                >
                  <template v-if="r.deltaBillable !== null">
                    {{ r.deltaBillable >= 0 ? '+' : '' }}{{ formatHours(r.deltaBillable) }}%
                  </template>
                  <template v-else>—</template>
                </TableCell>
                <TableCell class="text-right tabular-nums">{{ formatEur(r.invoiced) }}</TableCell>
                <TableCell class="text-right tabular-nums">{{ formatEur(r.collected) }}</TableCell>
                <TableCell class="text-right tabular-nums">
                  {{ r.net !== null ? formatEur(r.net) : '—' }}
                </TableCell>
                <TableCell class="text-right tabular-nums">
                  {{ r.due !== null ? formatEur(r.due) : '—' }}
                </TableCell>
                <TableCell class="text-right tabular-nums">
                  {{ r.monthlyNet !== null ? formatEur(r.monthlyNet) : '—' }}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <p class="mt-2 text-xs text-muted-foreground">
            Il netto è calcolato sull'incassato dell'anno con i dati fiscali di quell'anno; "—" dove
            i dati fiscali non sono configurati.
          </p>
        </CardContent>
      </Card>
    </template>
  </div>
</template>
