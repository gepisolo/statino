<script setup lang="ts">
// Le tre sezioni che prima stavano nel tab "Fatture in Cloud" delle
// Impostazioni, ora riferite a un singolo connettore.
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';
import { ArrowLeft, Link2, Link2Off, MoreHorizontal, Pencil } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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
import FicConnectionDialog from '@/components/integrations/FicConnectionDialog.vue';
import FicParamsDialog from '@/components/integrations/FicParamsDialog.vue';
import FicClientMappingDialog from '@/components/integrations/FicClientMappingDialog.vue';
import { clientsRepo, integrationsRepo, extractErrorMessage } from '@/lib/db';
import { AGGREGATION_LABELS, type FicEntity } from '@/lib/fattureincloud';
import { ficEntities, ficErrorMessage } from '@/lib/fattureincloudApi';
import { PROVIDER_LABELS, TYPE_LABELS } from '@/lib/integrations';
import { formatDate, formatEur, formatHours } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';
import type { Client, Integration } from '@/types/models';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const loading = ref(true);
const integration = ref<Integration | null>(null);
const clients = ref<Client[]>([]);

const connectionOpen = ref(false);
const paramsOpen = ref(false);
const mappingOpen = ref(false);
const mappingTarget = ref<Client | null>(null);
// Le anagrafiche FIC restano in cache tra un'apertura e l'altra: un account
// può averne centinaia, rileggerle a ogni riga sarebbe sprecato.
const entityCache = ref<FicEntity[]>([]);
const entitiesLoading = ref(false);

const config = computed(() => integration.value?.config ?? null);
const connected = computed(() => !!config.value?.companyId);
const mappingOf = computed(
  () => new Map((config.value?.mappings ?? []).map((m) => [m.clientId, m])),
);

onMounted(async () => {
  const id = String(route.params.id);
  try {
    const [list, clientList] = await Promise.all([
      integrationsRepo.list(auth.uid!),
      clientsRepo.list(auth.uid!),
    ]);
    integration.value = list.find((i) => i.id === id) ?? null;
    clients.value = clientList;
    if (!integration.value) {
      toast.error('Integrazione non trovata');
      router.replace('/integrations');
    }
  } catch (err) {
    toast.error("Impossibile caricare l'integrazione", {
      description: extractErrorMessage(err),
    });
  } finally {
    loading.value = false;
  }
});

function onSaved(i: Integration) {
  integration.value = i;
}

async function openMapping(client: Client) {
  mappingTarget.value = client;
  mappingOpen.value = true;
  if (entityCache.value.length || !config.value) return;
  entitiesLoading.value = true;
  try {
    entityCache.value = await ficEntities(integration.value!.id, config.value.companyId);
  } catch (err) {
    toast.error('Impossibile leggere le anagrafiche da Fatture in Cloud', {
      description: ficErrorMessage(err),
    });
  } finally {
    entitiesLoading.value = false;
  }
}

async function removeMapping(client: Client) {
  const i = integration.value;
  if (!i) return;
  try {
    integration.value = await integrationsRepo.update(auth.uid!, i.id, {
      type: i.type,
      provider: i.provider,
      title: i.title,
      config: { ...i.config, mappings: i.config.mappings.filter((m) => m.clientId !== client.id) },
    });
    toast.success('Collegamento rimosso', { description: client.name });
  } catch (err) {
    toast.error('Impossibile rimuovere il collegamento', {
      description: extractErrorMessage(err),
    });
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-2">
      <Button variant="ghost" size="sm" class="-ml-2" @click="router.push('/integrations')">
        <ArrowLeft class="size-3.5" />
        Integrazioni
      </Button>
      <div v-if="integration">
        <h1 class="text-2xl font-semibold tracking-tight">{{ integration.title }}</h1>
        <p class="text-sm text-muted-foreground">
          {{ TYPE_LABELS[integration.type] }} · {{ PROVIDER_LABELS[integration.provider] }}
        </p>
      </div>
    </div>

    <div v-if="loading" class="space-y-2">
      <Skeleton class="h-9 w-full" />
      <Skeleton class="h-9 w-full" />
    </div>

    <template v-else-if="integration && config">
      <section class="space-y-3 rounded-md border p-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <h2 class="text-sm font-medium">Connessione</h2>
            <p class="text-sm text-muted-foreground">
              <template v-if="connected">
                {{ config.companyName }} · token
                <span class="font-mono">{{ config.tokenHint || '—' }}</span>
                <template v-if="config.tokenUpdatedAt">
                  , aggiornato il {{ formatDate(config.tokenUpdatedAt) }}
                </template>
              </template>
              <template v-else>
                Non collegata. Serve un access token generato dalle applicazioni collegate di
                Fatture in Cloud.
              </template>
            </p>
          </div>
          <Button size="sm" variant="outline" @click="connectionOpen = true">
            <Link2 class="size-3.5" />
            {{ connected ? 'Aggiorna token…' : 'Collega…' }}
          </Button>
        </div>
      </section>

      <section class="space-y-3 rounded-md border p-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <h2 class="text-sm font-medium">Parametri fattura</h2>
            <p class="text-sm text-muted-foreground">
              Applicati a ogni documento creato con questo connettore. Il progressivo lo assegna
              sempre Fatture in Cloud.
            </p>
          </div>
          <Button size="sm" variant="outline" :disabled="!connected" @click="paramsOpen = true">
            <Pencil class="size-3.5" />
            Modifica…
          </Button>
        </div>

        <dl v-if="connected" class="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div class="flex justify-between gap-4 border-b py-1">
            <dt class="text-muted-foreground">Numerazione</dt>
            <dd>{{ config.numeration || 'predefinita' }}</dd>
          </div>
          <div class="flex justify-between gap-4 border-b py-1">
            <dt class="text-muted-foreground">Tipo IVA</dt>
            <dd class="truncate">{{ config.vatDescription || '—' }}</dd>
          </div>
          <div class="flex justify-between gap-4 border-b py-1">
            <dt class="text-muted-foreground">Metodo di pagamento</dt>
            <dd class="truncate">{{ config.paymentMethodName || '—' }}</dd>
          </div>
          <div class="flex justify-between gap-4 border-b py-1">
            <dt class="text-muted-foreground">Scadenza</dt>
            <dd>{{ config.paymentDueDays }} giorni</dd>
          </div>
          <div class="flex justify-between gap-4 border-b py-1">
            <dt class="text-muted-foreground">Marca da bollo</dt>
            <dd>
              <template v-if="config.stampDuty > 0">
                {{ formatEur(config.stampDuty) }} oltre {{ formatEur(config.stampDutyThreshold) }}
              </template>
              <template v-else>nessuna</template>
            </dd>
          </div>
          <div class="flex justify-between gap-4 border-b py-1">
            <dt class="text-muted-foreground">Rivalsa / cassa / ritenuta</dt>
            <dd class="tabular-nums">
              {{ formatHours(config.rivalsa) }}% · {{ formatHours(config.cassa) }}% ·
              {{ formatHours(config.withholdingTax) }}%
            </dd>
          </div>
          <div class="flex justify-between gap-4 border-b py-1">
            <dt class="text-muted-foreground">Fattura elettronica</dt>
            <dd>{{ config.eInvoice ? `sì · ${config.eiPaymentMethodCode || '—'}` : 'no' }}</dd>
          </div>
          <div class="flex justify-between gap-4 border-b py-1">
            <dt class="text-muted-foreground">Aggregazione predefinita</dt>
            <dd>{{ AGGREGATION_LABELS[config.defaultAggregation] }}</dd>
          </div>
        </dl>
      </section>

      <section class="space-y-3 rounded-md border p-4">
        <div class="min-w-0">
          <h2 class="text-sm font-medium">Clienti collegati</h2>
          <p class="text-sm text-muted-foreground">
            Ogni cliente statino va legato a un'anagrafica di Fatture in Cloud: senza, la fattura
            non si può creare con questo connettore.
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
                <template v-if="mappingOf.get(c.id)">
                  {{ mappingOf.get(c.id)!.entityName }}
                </template>
                <span v-else class="text-muted-foreground">Non collegato</span>
              </TableCell>
              <TableCell class="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger as-child>
                    <Button variant="ghost" size="icon" aria-label="Azioni" :disabled="!connected">
                      <MoreHorizontal class="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem @select="openMapping(c)">
                      <Link2 class="mr-2 size-4" />
                      {{ mappingOf.get(c.id) ? 'Modifica collegamento' : 'Collega…' }}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      v-if="mappingOf.get(c.id)"
                      class="text-destructive focus:text-destructive"
                      @select="removeMapping(c)"
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

      <FicConnectionDialog
        v-model:open="connectionOpen"
        :integration="integration"
        @saved="onSaved"
      />
      <FicParamsDialog v-model:open="paramsOpen" :integration="integration" @saved="onSaved" />
      <FicClientMappingDialog
        v-model:open="mappingOpen"
        :integration="integration"
        :client="mappingTarget"
        :entities="entityCache"
        :loading-entities="entitiesLoading"
        @saved="onSaved"
      />
    </template>
  </div>
</template>
