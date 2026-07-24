<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { toast } from 'vue-sonner';
import { MoreHorizontal, Pencil, Plus, Trash2 } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import FiscalYearFormDialog from '@/components/settings/FiscalYearFormDialog.vue';
import TaxRateFormDialog from '@/components/settings/TaxRateFormDialog.vue';
import { fiscalYearsRepo, taxRatesRepo, extractErrorMessage } from '@/lib/db';
import { formatEur, formatHours } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';
import type { FiscalYear, TaxRate } from '@/types/models';

const auth = useAuthStore();

const loading = ref(true);
const fiscalYears = ref<FiscalYear[]>([]);
const taxRates = ref<TaxRate[]>([]);

const fiscalFormOpen = ref(false);
const fiscalFormMode = ref<'create' | 'edit'>('create');
const fiscalFormTarget = ref<FiscalYear | null>(null);

const rateFormOpen = ref(false);
const rateFormMode = ref<'create' | 'edit'>('create');
const rateFormTarget = ref<TaxRate | null>(null);

const deleteFiscalOpen = ref(false);
const deleteFiscalTarget = ref<FiscalYear | null>(null);
const deleteRateOpen = ref(false);
const deleteRateTarget = ref<TaxRate | null>(null);
const deleteSubmitting = ref(false);

onMounted(async () => {
  try {
    [fiscalYears.value, taxRates.value] = await Promise.all([
      fiscalYearsRepo.list(auth.uid!),
      taxRatesRepo.list(auth.uid!),
    ]);
  } catch (err) {
    toast.error('Impossibile caricare le impostazioni', {
      description: extractErrorMessage(err),
    });
  } finally {
    loading.value = false;
  }
});

function openCreateFiscal() {
  fiscalFormMode.value = 'create';
  fiscalFormTarget.value = null;
  fiscalFormOpen.value = true;
}

function openEditFiscal(f: FiscalYear) {
  fiscalFormMode.value = 'edit';
  fiscalFormTarget.value = f;
  fiscalFormOpen.value = true;
}

function onFiscalSaved(f: FiscalYear) {
  const idx = fiscalYears.value.findIndex((x) => x.id === f.id);
  if (idx >= 0) {
    fiscalYears.value[idx] = f;
  } else {
    fiscalYears.value = [...fiscalYears.value, f];
  }
  fiscalYears.value = [...fiscalYears.value].sort((a, b) => b.year - a.year);
}

function openCreateRate() {
  rateFormMode.value = 'create';
  rateFormTarget.value = null;
  rateFormOpen.value = true;
}

function openEditRate(r: TaxRate) {
  rateFormMode.value = 'edit';
  rateFormTarget.value = r;
  rateFormOpen.value = true;
}

function onRateSaved(r: TaxRate) {
  const idx = taxRates.value.findIndex((x) => x.id === r.id);
  if (idx >= 0) {
    taxRates.value[idx] = r;
  } else {
    taxRates.value = [...taxRates.value, r];
  }
  taxRates.value = [...taxRates.value].sort(
    (a, b) => b.year - a.year || a.fromIncome - b.fromIncome,
  );
}

async function confirmDeleteFiscal() {
  if (!deleteFiscalTarget.value) return;
  deleteSubmitting.value = true;
  const f = deleteFiscalTarget.value;
  try {
    await fiscalYearsRepo.remove(auth.uid!, f.id);
    fiscalYears.value = fiscalYears.value.filter((x) => x.id !== f.id);
    toast.success('Anno fiscale eliminato', { description: String(f.year) });
    deleteFiscalOpen.value = false;
    deleteFiscalTarget.value = null;
  } catch (err) {
    toast.error('Impossibile eliminare', { description: extractErrorMessage(err) });
  } finally {
    deleteSubmitting.value = false;
  }
}

async function confirmDeleteRate() {
  if (!deleteRateTarget.value) return;
  deleteSubmitting.value = true;
  const r = deleteRateTarget.value;
  try {
    await taxRatesRepo.remove(auth.uid!, r.id);
    taxRates.value = taxRates.value.filter((x) => x.id !== r.id);
    toast.success('Aliquota eliminata', { description: r.name });
    deleteRateOpen.value = false;
    deleteRateTarget.value = null;
  } catch (err) {
    toast.error('Impossibile eliminare', { description: extractErrorMessage(err) });
  } finally {
    deleteSubmitting.value = false;
  }
}

const regimeLabels = { ordinario: 'Ordinario', forfettario: 'Forfettario' } as const;
const typeLabels = { contributi: 'Contributi', tasse: 'Tasse' } as const;
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">Impostazioni</h1>
      <p class="text-sm text-muted-foreground">
        Dati e aliquote fiscali per anno, usati per i calcoli sul netto.
      </p>
    </div>

    <div v-if="loading" class="space-y-2">
      <Skeleton class="h-9 w-full" />
      <Skeleton class="h-9 w-full" />
      <Skeleton class="h-9 w-full" />
    </div>

    <Tabs v-else default-value="fiscal">
      <TabsList>
        <TabsTrigger value="fiscal">Dati fiscali</TabsTrigger>
        <TabsTrigger value="rates">Aliquote fiscali</TabsTrigger>
      </TabsList>

      <TabsContent value="fiscal" class="space-y-4">
        <div class="flex justify-end">
          <Button size="sm" @click="openCreateFiscal">
            <Plus class="size-3.5" />
            Nuovo anno
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Anno</TableHead>
              <TableHead>Regime</TableHead>
              <TableHead class="text-right">Indice di redditività</TableHead>
              <TableHead class="w-12 text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-if="!fiscalYears.length">
              <TableCell colspan="4" class="text-center text-muted-foreground">
                Nessun anno configurato.
              </TableCell>
            </TableRow>
            <TableRow v-for="f in fiscalYears" :key="f.id">
              <TableCell class="font-medium tabular-nums">{{ f.year }}</TableCell>
              <TableCell>{{ regimeLabels[f.regime] }}</TableCell>
              <TableCell class="text-right tabular-nums">
                <template v-if="f.profitabilityIndex !== null">
                  {{ formatHours(f.profitabilityIndex) }}%
                </template>
                <template v-else>—</template>
              </TableCell>
              <TableCell class="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger as-child>
                    <Button variant="ghost" size="icon" aria-label="Azioni">
                      <MoreHorizontal class="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem @select="openEditFiscal(f)">
                      <Pencil class="mr-2 size-4" />
                      Modifica
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      class="text-destructive focus:text-destructive"
                      @select="
                        deleteFiscalTarget = f;
                        deleteFiscalOpen = true;
                      "
                    >
                      <Trash2 class="mr-2 size-4" />
                      Elimina…
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TabsContent>

      <TabsContent value="rates" class="space-y-4">
        <div class="flex justify-end">
          <Button size="sm" @click="openCreateRate">
            <Plus class="size-3.5" />
            Nuova aliquota
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Anno</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead class="text-right">Aliquota</TableHead>
              <TableHead class="text-right">Da imponibile</TableHead>
              <TableHead class="text-right">A imponibile</TableHead>
              <TableHead class="w-12 text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-if="!taxRates.length">
              <TableCell colspan="7" class="text-center text-muted-foreground">
                Nessuna aliquota configurata.
              </TableCell>
            </TableRow>
            <TableRow v-for="r in taxRates" :key="r.id">
              <TableCell class="font-medium tabular-nums">{{ r.year }}</TableCell>
              <TableCell>{{ typeLabels[r.type] }}</TableCell>
              <TableCell>{{ r.name }}</TableCell>
              <TableCell class="text-right tabular-nums">{{ formatHours(r.rate) }}%</TableCell>
              <TableCell class="text-right tabular-nums">{{ formatEur(r.fromIncome) }}</TableCell>
              <TableCell class="text-right tabular-nums">
                <template v-if="r.toIncome !== null">{{ formatEur(r.toIncome) }}</template>
                <template v-else>—</template>
              </TableCell>
              <TableCell class="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger as-child>
                    <Button variant="ghost" size="icon" aria-label="Azioni">
                      <MoreHorizontal class="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem @select="openEditRate(r)">
                      <Pencil class="mr-2 size-4" />
                      Modifica
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      class="text-destructive focus:text-destructive"
                      @select="
                        deleteRateTarget = r;
                        deleteRateOpen = true;
                      "
                    >
                      <Trash2 class="mr-2 size-4" />
                      Elimina…
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TabsContent>
    </Tabs>

    <FiscalYearFormDialog
      v-model:open="fiscalFormOpen"
      :mode="fiscalFormMode"
      :fiscal-year="fiscalFormTarget"
      :existing="fiscalYears"
      @saved="onFiscalSaved"
    />

    <TaxRateFormDialog
      v-model:open="rateFormOpen"
      :mode="rateFormMode"
      :tax-rate="rateFormTarget"
      @saved="onRateSaved"
    />

    <Dialog v-model:open="deleteFiscalOpen">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Eliminare l'anno fiscale?</DialogTitle>
          <DialogDescription>
            La riga del
            <span class="font-medium">{{ deleteFiscalTarget?.year }}</span> verrà rimossa.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            :disabled="deleteSubmitting"
            @click="deleteFiscalOpen = false"
          >
            Annulla
          </Button>
          <Button
            variant="destructive"
            size="sm"
            :disabled="deleteSubmitting"
            @click="confirmDeleteFiscal"
          >
            {{ deleteSubmitting ? 'Eliminazione…' : 'Elimina' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="deleteRateOpen">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Eliminare l'aliquota?</DialogTitle>
          <DialogDescription>
            <span class="font-medium">{{ deleteRateTarget?.name }}</span>
            ({{ deleteRateTarget?.year }}) verrà rimossa.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            :disabled="deleteSubmitting"
            @click="deleteRateOpen = false"
          >
            Annulla
          </Button>
          <Button
            variant="destructive"
            size="sm"
            :disabled="deleteSubmitting"
            @click="confirmDeleteRate"
          >
            {{ deleteSubmitting ? 'Eliminazione…' : 'Elimina' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
