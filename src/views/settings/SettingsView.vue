<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { toast } from 'vue-sonner';
import { Link2, Link2Off, MoreHorizontal, Pencil, Plus, Trash2 } from '@lucide/vue';
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
import FicConnectionFormDialog from '@/components/settings/FicConnectionFormDialog.vue';
import FicSettingsFormDialog from '@/components/settings/FicSettingsFormDialog.vue';
import FicClientMappingFormDialog from '@/components/settings/FicClientMappingFormDialog.vue';
import {
  clientsRepo,
  fiscalYearsRepo,
  integrationsRepo,
  taxRatesRepo,
  extractErrorMessage,
} from '@/lib/db';
import { AGGREGATION_LABELS, type FicEntity } from '@/lib/fattureincloud';
import { ficEntities, ficErrorMessage } from '@/lib/fattureincloudApi';
import { formatDate, formatEur, formatHours } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';
import type { Client, FicConfig, FiscalYear, TaxRate } from '@/types/models';

const auth = useAuthStore();

const loading = ref(true);
const fiscalYears = ref<FiscalYear[]>([]);
const taxRates = ref<TaxRate[]>([]);
const clients = ref<Client[]>([]);
const ficConfig = ref<FicConfig | null>(null);

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

const ficConnectionOpen = ref(false);
const ficSettingsOpen = ref(false);
const ficMappingOpen = ref(false);
const ficMappingTarget = ref<Client | null>(null);
const ficDisconnectOpen = ref(false);
// Le anagrafiche FIC restano in cache tra un'apertura e l'altra del dialog:
// un account può averne centinaia, rileggerle a ogni riga sarebbe sprecato.
const ficEntityCache = ref<FicEntity[]>([]);
const ficEntitiesLoading = ref(false);

onMounted(async () => {
  try {
    [fiscalYears.value, taxRates.value, clients.value, ficConfig.value] = await Promise.all([
      fiscalYearsRepo.list(auth.uid!),
      taxRatesRepo.list(auth.uid!),
      clientsRepo.list(auth.uid!),
      integrationsRepo.getFic(auth.uid!),
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

// --- Fatture in Cloud ------------------------------------------------------

const ficMappingOf = computed(
  () => new Map((ficConfig.value?.mappings ?? []).map((m) => [m.clientId, m])),
);

function onFicSaved(c: FicConfig) {
  ficConfig.value = c;
}

async function openFicMapping(client: Client) {
  ficMappingTarget.value = client;
  ficMappingOpen.value = true;
  if (ficEntityCache.value.length || !ficConfig.value) return;
  ficEntitiesLoading.value = true;
  try {
    ficEntityCache.value = await ficEntities(ficConfig.value.companyId);
  } catch (err) {
    toast.error('Impossibile leggere le anagrafiche da Fatture in Cloud', {
      description: ficErrorMessage(err),
    });
  } finally {
    ficEntitiesLoading.value = false;
  }
}

async function removeFicMapping(client: Client) {
  const c = ficConfig.value;
  if (!c) return;
  try {
    ficConfig.value = await integrationsRepo.saveFic(auth.uid!, {
      ...c,
      mappings: c.mappings.filter((m) => m.clientId !== client.id),
    });
    toast.success('Collegamento rimosso', { description: client.name });
  } catch (err) {
    toast.error('Impossibile rimuovere il collegamento', {
      description: extractErrorMessage(err),
    });
  }
}

async function confirmFicDisconnect() {
  deleteSubmitting.value = true;
  try {
    await integrationsRepo.removeFic(auth.uid!);
    // Il token viene svuotato, non cancellato: la regola concede la
    // scrittura ma non la lettura, quindi non si può nemmeno verificare
    // che sia sparito — sovrascriverlo con una stringa vuota è l'unico
    // modo di renderlo inutilizzabile dal server.
    await integrationsRepo.setFicToken(auth.uid!, '');
    ficConfig.value = null;
    ficEntityCache.value = [];
    toast.success('Fatture in Cloud scollegato', {
      description: 'Revoca anche il token dalle applicazioni collegate su Fatture in Cloud.',
    });
    ficDisconnectOpen.value = false;
  } catch (err) {
    toast.error('Impossibile scollegare', { description: extractErrorMessage(err) });
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
        Dati e aliquote fiscali per anno, usati per i calcoli sul netto, e il collegamento a Fatture
        in Cloud.
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
        <TabsTrigger value="fic">Fatture in Cloud</TabsTrigger>
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
              <TableHead class="text-right">Limite forfettario</TableHead>
              <TableHead class="text-right">Limite hard</TableHead>
              <TableHead class="w-12 text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-if="!fiscalYears.length">
              <TableCell colspan="6" class="text-center text-muted-foreground">
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
              <TableCell class="text-right tabular-nums">
                <template v-if="f.forfaitLimit != null">{{ formatEur(f.forfaitLimit) }}</template>
                <template v-else>—</template>
              </TableCell>
              <TableCell class="text-right tabular-nums">
                <template v-if="f.hardLimit != null">{{ formatEur(f.hardLimit) }}</template>
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

      <TabsContent value="fic" class="space-y-4">
        <section class="space-y-3 rounded-md border p-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <h3 class="text-sm font-medium">Connessione</h3>
              <p class="text-sm text-muted-foreground">
                <template v-if="ficConfig">
                  {{ ficConfig.companyName }} · token
                  <span class="font-mono">{{ ficConfig.tokenHint || '—' }}</span>
                  <template v-if="ficConfig.tokenUpdatedAt">
                    , aggiornato il {{ formatDate(ficConfig.tokenUpdatedAt) }}
                  </template>
                </template>
                <template v-else>
                  Nessun collegamento. Serve un access token generato dalle applicazioni collegate
                  di Fatture in Cloud.
                </template>
              </p>
            </div>
            <div class="flex gap-2">
              <Button size="sm" variant="outline" @click="ficConnectionOpen = true">
                <Link2 class="size-3.5" />
                {{ ficConfig ? 'Aggiorna token…' : 'Collega…' }}
              </Button>
              <Button
                v-if="ficConfig"
                size="sm"
                variant="outline"
                class="text-destructive"
                @click="ficDisconnectOpen = true"
              >
                <Link2Off class="size-3.5" />
                Scollega
              </Button>
            </div>
          </div>
        </section>

        <section class="space-y-3 rounded-md border p-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <h3 class="text-sm font-medium">Parametri fattura</h3>
              <p class="text-sm text-muted-foreground">
                Applicati a ogni documento creato. Il progressivo lo assegna sempre Fatture in
                Cloud.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              :disabled="!ficConfig"
              @click="ficSettingsOpen = true"
            >
              <Pencil class="size-3.5" />
              Modifica…
            </Button>
          </div>

          <dl v-if="ficConfig" class="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div class="flex justify-between gap-4 border-b py-1">
              <dt class="text-muted-foreground">Numerazione</dt>
              <dd>{{ ficConfig.numeration || 'predefinita' }}</dd>
            </div>
            <div class="flex justify-between gap-4 border-b py-1">
              <dt class="text-muted-foreground">Tipo IVA</dt>
              <dd class="truncate">{{ ficConfig.vatDescription || '—' }}</dd>
            </div>
            <div class="flex justify-between gap-4 border-b py-1">
              <dt class="text-muted-foreground">Metodo di pagamento</dt>
              <dd class="truncate">{{ ficConfig.paymentMethodName || '—' }}</dd>
            </div>
            <div class="flex justify-between gap-4 border-b py-1">
              <dt class="text-muted-foreground">Scadenza</dt>
              <dd>{{ ficConfig.paymentDueDays }} giorni</dd>
            </div>
            <div class="flex justify-between gap-4 border-b py-1">
              <dt class="text-muted-foreground">Marca da bollo</dt>
              <dd>
                <template v-if="ficConfig.stampDuty > 0">
                  {{ formatEur(ficConfig.stampDuty) }} oltre
                  {{ formatEur(ficConfig.stampDutyThreshold) }}
                </template>
                <template v-else>nessuna</template>
              </dd>
            </div>
            <div class="flex justify-between gap-4 border-b py-1">
              <dt class="text-muted-foreground">Rivalsa / cassa / ritenuta</dt>
              <dd class="tabular-nums">
                {{ formatHours(ficConfig.rivalsa) }}% · {{ formatHours(ficConfig.cassa) }}% ·
                {{ formatHours(ficConfig.withholdingTax) }}%
              </dd>
            </div>
            <div class="flex justify-between gap-4 border-b py-1">
              <dt class="text-muted-foreground">Fattura elettronica</dt>
              <dd>
                {{ ficConfig.eInvoice ? `sì · ${ficConfig.eiPaymentMethodCode || '—'}` : 'no' }}
              </dd>
            </div>
            <div class="flex justify-between gap-4 border-b py-1">
              <dt class="text-muted-foreground">Aggregazione predefinita</dt>
              <dd>{{ AGGREGATION_LABELS[ficConfig.defaultAggregation] }}</dd>
            </div>
          </dl>
        </section>

        <section class="space-y-3 rounded-md border p-4">
          <div class="min-w-0">
            <h3 class="text-sm font-medium">Clienti collegati</h3>
            <p class="text-sm text-muted-foreground">
              Ogni cliente statino va legato a un'anagrafica di Fatture in Cloud: senza, la fattura
              non si può creare.
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Anagrafica Fatture in Cloud</TableHead>
                <TableHead class="w-12 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-if="!clients.length">
                <TableCell colspan="3" class="text-center text-muted-foreground">
                  Nessun cliente in anagrafica.
                </TableCell>
              </TableRow>
              <TableRow v-for="c in clients" :key="c.id">
                <TableCell class="font-medium">{{ c.name }}</TableCell>
                <TableCell>
                  <template v-if="ficMappingOf.get(c.id)">
                    {{ ficMappingOf.get(c.id)!.entityName }}
                  </template>
                  <span v-else class="text-muted-foreground">Non collegato</span>
                </TableCell>
                <TableCell class="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger as-child>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Azioni"
                        :disabled="!ficConfig"
                      >
                        <MoreHorizontal class="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem @select="openFicMapping(c)">
                        <Link2 class="mr-2 size-4" />
                        {{ ficMappingOf.get(c.id) ? 'Modifica collegamento' : 'Collega…' }}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        v-if="ficMappingOf.get(c.id)"
                        class="text-destructive focus:text-destructive"
                        @select="removeFicMapping(c)"
                      >
                        <Link2Off class="mr-2 size-4" />
                        Rimuovi collegamento
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </section>
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

    <FicConnectionFormDialog
      v-model:open="ficConnectionOpen"
      :config="ficConfig"
      @saved="onFicSaved"
    />

    <FicSettingsFormDialog v-model:open="ficSettingsOpen" :config="ficConfig" @saved="onFicSaved" />

    <FicClientMappingFormDialog
      v-model:open="ficMappingOpen"
      :config="ficConfig"
      :client="ficMappingTarget"
      :entities="ficEntityCache"
      :loading-entities="ficEntitiesLoading"
      @saved="onFicSaved"
    />

    <Dialog v-model:open="ficDisconnectOpen">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Scollegare Fatture in Cloud?</DialogTitle>
          <DialogDescription>
            Parametri, mappature e token vengono rimossi da statino. Le fatture già create su
            Fatture in Cloud restano dove sono. Revoca poi il token dalle applicazioni collegate,
            sul loro sito.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            :disabled="deleteSubmitting"
            @click="ficDisconnectOpen = false"
          >
            Annulla
          </Button>
          <Button
            variant="destructive"
            size="sm"
            :disabled="deleteSubmitting"
            @click="confirmFicDisconnect"
          >
            {{ deleteSubmitting ? 'Scollegamento…' : 'Scollega' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

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
