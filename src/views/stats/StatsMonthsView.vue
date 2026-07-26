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
import StatTile from '@/components/stats/StatTile.vue';
import LimitMeter from '@/components/stats/LimitMeter.vue';
import {
  contractsRepo,
  entriesRepo,
  fiscalYearsRepo,
  invoicesRepo,
  taxRatesRepo,
  extractErrorMessage,
} from '@/lib/db';
import { formatEur, formatHours, formatPercent, monthName } from '@/lib/format';
import { elapsedMonths, monthRange, periodTotals } from '@/lib/stats';
import { computeNet } from '@/lib/tax';
import { useAuthStore } from '@/stores/auth';
import type { Contract, Entry, FiscalYear, Invoice, TaxRate } from '@/types/models';

const auth = useAuthStore();

const now = new Date();
const year = ref(now.getFullYear());

const loadingCatalogs = ref(true);
const loadingEntries = ref(true);
const contracts = ref<Contract[]>([]);
const invoices = ref<Invoice[]>([]);
const fiscalYears = ref<FiscalYear[]>([]);
const taxRates = ref<TaxRate[]>([]);
const entries = ref<Entry[]>([]);

const yearOptions = computed(() => {
  const current = now.getFullYear();
  return [current - 2, current - 1, current, current + 1];
});
const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

onMounted(async () => {
  try {
    [contracts.value, invoices.value, fiscalYears.value, taxRates.value] = await Promise.all([
      contractsRepo.list(auth.uid!),
      invoicesRepo.list(auth.uid!),
      fiscalYearsRepo.list(auth.uid!),
      taxRatesRepo.list(auth.uid!),
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
const netOf = (gross: number) => computeNet(gross, year.value, fiscalYears.value, taxRates.value);
const hasFiscalConfig = computed(() => fiscalYears.value.some((f) => f.year === year.value));

const perMonth = computed(() =>
  months.map((m) => {
    const [from, to] = monthRange(year.value, m);
    return periodTotals(entries.value, invoices.value, rates.value, from, to);
  }),
);

// Monthly net as the *marginal* net of the cumulative collected amount:
// the twelve rows sum exactly to the year's net even with progressive
// brackets.
const perMonthNet = computed(() => {
  let cum = 0;
  let prevNet = 0;
  let prevDue = 0;
  return perMonth.value.map((t) => {
    cum += t.collected;
    const b = netOf(cum);
    if (!b) return null;
    const row = { net: b.net - prevNet, due: b.due - prevDue };
    prevNet = b.net;
    prevDue = b.due;
    return row;
  });
});

const yearTotals = computed(() =>
  perMonth.value.reduce(
    (acc, t) => ({
      hours: acc.hours + t.hours,
      billable: acc.billable + t.billable,
      invoiced: acc.invoiced + t.invoiced,
      collected: acc.collected + t.collected,
    }),
    { hours: 0, billable: 0, invoiced: 0, collected: 0 },
  ),
);

const yearNet = computed(() => netOf(yearTotals.value.collected));
const divisor = computed(() => elapsedMonths(year.value, now));
const projectedBillable = computed(() => (yearTotals.value.billable / divisor.value) * 12);

// Carico fiscale medio: tasse + contributi rispetto all'incassato.
const taxLoadPct = computed(() => {
  if (!yearNet.value || yearTotals.value.collected <= 0) return null;
  return (yearNet.value.due / yearTotals.value.collected) * 100;
});

const fiscalYear = computed(() => fiscalYears.value.find((f) => f.year === year.value));
const limits = computed(() => {
  const f = fiscalYear.value;
  if (!f || f.regime !== 'forfettario' || f.forfaitLimit == null) return null;
  return { forfait: f.forfaitLimit, hard: f.hardLimit ?? null };
});

const monthLabels = computed(() => months.map((m) => monthName(m).slice(0, 3)));
const hoursSeries = computed(() => [{ name: 'Ore', values: perMonth.value.map((t) => t.hours) }]);
const eurSeries = computed(() => [
  { name: 'Fatturabile', values: perMonth.value.map((t) => t.billable) },
  { name: 'Fatturato', values: perMonth.value.map((t) => t.invoiced) },
  { name: 'Incassato', values: perMonth.value.map((t) => t.collected) },
]);

function eurTick(n: number): string {
  return n >= 1000 ? `${formatHours(n / 1000)}k` : String(Math.round(n));
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Statistiche per mese</h1>
        <p class="text-sm text-muted-foreground">
          Andamento mensile dell'anno: ore, importi e netto (sull'incassato).
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
      <Skeleton class="h-24 w-full" />
      <Skeleton class="h-64 w-full" />
      <Skeleton class="h-64 w-full" />
    </div>

    <template v-else>
      <div class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile
          label="Ore"
          :value="formatHours(yearTotals.hours)"
          :sub="`media ${formatHours(yearTotals.hours / divisor)}/mese`"
        />
        <StatTile
          label="Fatturabile"
          :value="formatEur(yearTotals.billable)"
          :sub="`media ${formatEur(yearTotals.billable / divisor)}/mese`"
        />
        <StatTile
          label="Fatturato"
          :value="formatEur(yearTotals.invoiced)"
          :sub="`proiezione anno ${formatEur(projectedBillable)}`"
        />
        <StatTile label="Incassato" :value="formatEur(yearTotals.collected)" />
        <StatTile
          label="Netto (su incassato)"
          :value="yearNet ? formatEur(yearNet.net) : '—'"
          :sub="yearNet ? `media ${formatEur(yearNet.net / divisor)}/mese` : undefined"
        />
        <StatTile
          label="Da accantonare"
          :value="yearNet ? formatEur(yearNet.due) : '—'"
          :sub="
            yearNet && yearTotals.collected > 0
              ? `${Math.round((yearNet.due / yearTotals.collected) * 100)}% dell'incassato`
              : undefined
          "
        />
      </div>

      <p v-if="!hasFiscalConfig" class="text-sm text-muted-foreground">
        Per il netto configura i
        <RouterLink to="/settings" class="underline">dati fiscali</RouterLink>
        del {{ year }}.
      </p>

      <div v-if="yearNet || limits" class="grid gap-6 xl:grid-cols-2">
        <Card v-if="yearNet">
          <CardHeader>
            <CardTitle class="text-base">Carico fiscale — anno {{ year }}</CardTitle>
          </CardHeader>
          <CardContent class="space-y-1">
            <p class="pb-1 text-xs text-muted-foreground">
              Calcolato sull'incassato; la somma è il "da accantonare".
            </p>
            <div class="flex items-baseline justify-between">
              <span class="text-sm text-muted-foreground">Tasse</span>
              <span class="text-base font-medium tabular-nums">
                {{ formatEur(yearNet.taxes) }}
              </span>
            </div>
            <div class="flex items-baseline justify-between">
              <span class="text-sm text-muted-foreground">Contributi</span>
              <span class="text-base font-medium tabular-nums">
                {{ formatEur(yearNet.contributions) }}
              </span>
            </div>
            <div class="flex items-baseline justify-between">
              <span class="text-sm text-muted-foreground">Totale da accantonare</span>
              <span class="text-base font-semibold tabular-nums">
                {{ formatEur(yearNet.due) }}
              </span>
            </div>
            <div class="mt-2 flex items-baseline justify-between border-t pt-2">
              <span class="text-sm text-muted-foreground">Carico fiscale medio</span>
              <span class="text-xl font-semibold tabular-nums">
                {{ taxLoadPct != null ? formatPercent(taxLoadPct) : '—' }}
              </span>
            </div>
          </CardContent>
        </Card>
        <Card v-if="limits">
          <CardContent class="pt-6">
            <LimitMeter
              :invoiced="yearTotals.invoiced"
              :forfait-limit="limits.forfait"
              :hard-limit="limits.hard"
            />
          </CardContent>
        </Card>
      </div>

      <div class="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle class="text-base">Ore per mese</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart
              :labels="monthLabels"
              :series="hoursSeries"
              :format-value="(n) => `${formatHours(n)} h`"
              :format-tick="formatHours"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle class="text-base">Euro per mese</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart
              :labels="monthLabels"
              :series="eurSeries"
              :format-value="formatEur"
              :format-tick="eurTick"
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle class="text-base">Dettaglio mensile</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mese</TableHead>
                <TableHead class="text-right">Ore</TableHead>
                <TableHead class="text-right">Fatturabile</TableHead>
                <TableHead class="text-right">Fatturato</TableHead>
                <TableHead class="text-right">Incassato</TableHead>
                <TableHead class="text-right">Netto</TableHead>
                <TableHead class="text-right">Da accantonare</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="(t, idx) in perMonth" :key="months[idx]">
                <TableCell class="font-medium capitalize">{{ monthName(months[idx]) }}</TableCell>
                <TableCell class="text-right tabular-nums">{{ formatHours(t.hours) }}</TableCell>
                <TableCell class="text-right tabular-nums">{{ formatEur(t.billable) }}</TableCell>
                <TableCell class="text-right tabular-nums">{{ formatEur(t.invoiced) }}</TableCell>
                <TableCell class="text-right tabular-nums">{{ formatEur(t.collected) }}</TableCell>
                <TableCell class="text-right tabular-nums">
                  {{ perMonthNet[idx] ? formatEur(perMonthNet[idx]!.net) : '—' }}
                </TableCell>
                <TableCell class="text-right tabular-nums">
                  {{ perMonthNet[idx] ? formatEur(perMonthNet[idx]!.due) : '—' }}
                </TableCell>
              </TableRow>
              <TableRow class="font-medium">
                <TableCell>Totale</TableCell>
                <TableCell class="text-right tabular-nums">
                  {{ formatHours(yearTotals.hours) }}
                </TableCell>
                <TableCell class="text-right tabular-nums">
                  {{ formatEur(yearTotals.billable) }}
                </TableCell>
                <TableCell class="text-right tabular-nums">
                  {{ formatEur(yearTotals.invoiced) }}
                </TableCell>
                <TableCell class="text-right tabular-nums">
                  {{ formatEur(yearTotals.collected) }}
                </TableCell>
                <TableCell class="text-right tabular-nums">
                  {{ yearNet ? formatEur(yearNet.net) : '—' }}
                </TableCell>
                <TableCell class="text-right tabular-nums">
                  {{ yearNet ? formatEur(yearNet.due) : '—' }}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </template>
  </div>
</template>
