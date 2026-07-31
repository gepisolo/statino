<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { toast } from 'vue-sonner';
import { AlertTriangle, Check } from '@lucide/vue';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { entriesRepo, invoicesRepo, projectsRepo, extractErrorMessage } from '@/lib/db';
import {
  AGGREGATION_LABELS,
  buildIssuedDocument,
  buildLines,
  computeTotals,
  round2,
} from '@/lib/fattureincloud';
import { ficCreateInvoice, ficErrorMessage } from '@/lib/fattureincloudApi';
import { addDays, formatDate, formatEur, formatHours, todayIso } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';
import type {
  Client,
  Contract,
  Entry,
  FicAggregation,
  Integration,
  Invoice,
  Project,
} from '@/types/models';

const props = defineProps<{
  open: boolean;
  invoice: Invoice | null;
  clients: Client[];
  contracts: Contract[];
  /** Connettori di fatturazione collegati, già filtrati dalla lista. */
  integrations: Integration[];
}>();

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void;
  (e: 'created', i: Invoice): void;
}>();

const auth = useAuthStore();
const router = useRouter();

const loading = ref(false);
const submitting = ref(false);
const entries = ref<Entry[]>([]);
const projects = ref<Project[]>([]);

const date = ref(todayIso());
const aggregation = ref<FicAggregation>('contratto');
const singleDescription = ref('');
const integrationId = ref('');

const integration = computed(
  () => props.integrations.find((i) => i.id === integrationId.value) ?? null,
);
const config = computed(() => integration.value?.config ?? null);

const client = computed(() => props.clients.find((c) => c.id === props.invoice?.clientId));
const mapping = computed(() =>
  config.value?.mappings.find((m) => m.clientId === props.invoice?.clientId),
);

const lines = computed(() => {
  if (!props.invoice || loading.value) return [];
  return buildLines({
    aggregation: aggregation.value,
    invoice: props.invoice,
    entries: entries.value,
    contracts: props.contracts,
    projects: projects.value,
    singleDescription: singleDescription.value,
  });
});

const totals = computed(() => (config.value ? computeTotals(lines.value, config.value) : null));

// Lo scarto tra la somma delle righe e l'importo congelato. Sotto il
// mezzo euro è arrotondamento fisiologico; sopra i cinque c'è qualcosa di
// strutturalmente sbagliato (un contratto mancante, una tariffa cambiata a
// metà periodo) e non si manda niente.
const delta = computed(() =>
  props.invoice ? round2((totals.value?.taxable ?? 0) - round2(props.invoice.amount)) : 0,
);
const deltaLevel = computed<'ok' | 'warn' | 'block'>(() => {
  const d = Math.abs(delta.value);
  if (d === 0) return 'ok';
  return d <= 5 ? 'warn' : 'block';
});

const dueDate = computed(() =>
  config.value ? addDays(date.value, config.value.paymentDueDays) : '',
);

const valid = computed(
  () =>
    !!props.invoice &&
    !!mapping.value &&
    !!config.value &&
    config.value.vatId != null &&
    /^\d{4}-\d{2}-\d{2}$/.test(date.value) &&
    lines.value.length > 0 &&
    deltaLevel.value !== 'block' &&
    (aggregation.value !== 'unica' || singleDescription.value.trim().length > 0),
);

watch(
  () => props.open,
  async (open) => {
    const invoice = props.invoice;
    if (!open || !invoice) return;
    date.value = todayIso();
    // Con un connettore solo non ha senso far scegliere.
    integrationId.value =
      props.integrations.length === 1 ? props.integrations[0].id : integrationId.value;
    if (!props.integrations.some((i) => i.id === integrationId.value)) integrationId.value = '';
    aggregation.value = config.value?.defaultAggregation ?? 'contratto';
    singleDescription.value = `Attività dal ${formatDate(invoice.dateFrom)} al ${formatDate(invoice.dateTo)}`;
    entries.value = [];
    projects.value = [];
    // Senza connettore scelto o senza mappatura non si carica niente: il
    // dialog mostra prima il selettore, poi eventualmente il blocco.
    if (!integration.value || !mapping.value) return;

    loading.value = true;
    try {
      // I progetti non sono caricati dalla lista fatture e non devono
      // esserlo: servono solo qui, poche volte al mese.
      [entries.value, projects.value] = await Promise.all([
        entriesRepo.listByInvoice(auth.uid!, invoice.id),
        projectsRepo.list(auth.uid!),
      ]);
    } catch (err) {
      toast.error('Impossibile caricare le voci della fattura', {
        description: extractErrorMessage(err),
      });
    } finally {
      loading.value = false;
    }
  },
);

async function submit() {
  const invoice = props.invoice;
  const conn = integration.value;
  const cfg = config.value;
  const entityId = mapping.value?.entityId;
  if (!valid.value || !invoice || !conn || !cfg || !entityId) return;

  submitting.value = true;
  try {
    const document = buildIssuedDocument({
      aggregation: aggregation.value,
      invoice,
      entries: entries.value,
      contracts: props.contracts,
      projects: projects.value,
      singleDescription: singleDescription.value,
      config: cfg,
      entityId,
      date: date.value,
    });
    const created = await ficCreateInvoice(conn.id, cfg.companyId, document);
    const external = {
      provider: 'fattureincloud' as const,
      integrationId: conn.id,
      integrationTitle: conn.title,
      companyId: cfg.companyId,
      documentId: created.id,
      number: String(created.number ?? ''),
      numeration: created.numeration ?? '',
      date: created.date ?? date.value,
      amountNet: created.amount_net ?? 0,
      amountVat: created.amount_vat ?? 0,
      amountGross: created.amount_gross ?? 0,
      url: created.url ?? null,
      createdAt: todayIso(),
      aggregation: aggregation.value,
    };

    try {
      await invoicesRepo.setExternal(auth.uid!, invoice.id, external);
    } catch (err) {
      // Il documento su FIC ESISTE già: un errore generico spingerebbe a
      // riprovare, ed è così che nascono i duplicati.
      toast.error(`Documento creato su Fatture in Cloud (n. ${external.number})`, {
        description: `Non è stato registrato su statino: non ricrearlo, ricarica la pagina. ${extractErrorMessage(err)}`,
        duration: 15000,
      });
      emit('update:open', false);
      return;
    }

    // Il lordo che avevamo stimato e quello vero devono coincidere: se non
    // succede la fattura è comunque valida, ma va guardata.
    if (totals.value?.exact && Math.abs(external.amountGross - totals.value.gross) >= 0.01) {
      toast.warning('Totale diverso da quello previsto', {
        description: `Anteprima ${formatEur(totals.value.gross)}, Fatture in Cloud ${formatEur(external.amountGross)}.`,
        duration: 12000,
      });
    }

    toast.success('Fattura creata su Fatture in Cloud', {
      description: `n. ${external.number} · ${formatEur(external.amountGross)}`,
    });
    emit('created', { ...invoice, external });
    emit('update:open', false);
  } catch (err) {
    toast.error('Impossibile creare la fattura', { description: ficErrorMessage(err) });
  } finally {
    submitting.value = false;
  }
}

function goToIntegrations() {
  emit('update:open', false);
  router.push(integration.value ? `/integrations/${integration.value.id}` : '/integrations');
}

function handleOpenChange(v: boolean) {
  if (submitting.value) return;
  emit('update:open', v);
}

const aggregations = Object.entries(AGGREGATION_LABELS) as [FicAggregation, string][];
</script>

<template>
  <Dialog :open="open" @update:open="handleOpenChange">
    <DialogContent class="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
      <!-- Prima si sceglie il connettore, poi si guarda se il cliente è mappato. -->
      <template v-if="integrations.length > 1 && !integration">
        <DialogHeader>
          <DialogTitle>Con quale connettore?</DialogTitle>
          <DialogDescription>
            Hai più integrazioni di fatturazione: scegli con quale creare il documento.
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-2">
          <Label for="fic-connector">Connettore</Label>
          <Select v-model="integrationId">
            <SelectTrigger id="fic-connector" class="w-full">
              <SelectValue placeholder="Scegli il connettore" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="i in integrations" :key="i.id" :value="i.id">
                {{ i.title }} · {{ i.config.companyName }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" @click="handleOpenChange(false)">Annulla</Button>
        </DialogFooter>
      </template>

      <!-- Senza mappatura non c'è destinatario: si può solo andare a crearla. -->
      <template v-else-if="!mapping">
        <DialogHeader>
          <DialogTitle>Cliente non collegato</DialogTitle>
          <DialogDescription>
            <span class="font-medium">{{ client?.name }}</span> non è ancora legato a un'anagrafica
            di Fatture in Cloud. Collegalo dalle impostazioni, poi riprova.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" size="sm" @click="handleOpenChange(false)">Annulla</Button>
          <Button size="sm" @click="goToIntegrations">Vai all'integrazione</Button>
        </DialogFooter>
      </template>

      <template v-else>
        <DialogHeader>
          <DialogTitle>Crea la fattura su Fatture in Cloud</DialogTitle>
          <DialogDescription>
            {{ client?.name }} → {{ mapping.entityName }} · periodo
            {{ formatDate(invoice!.dateFrom) }}–{{ formatDate(invoice!.dateTo) }}. Il progressivo lo
            assegna Fatture in Cloud.
          </DialogDescription>
        </DialogHeader>

        <form class="space-y-4" @submit.prevent="submit">
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="space-y-2">
              <Label for="fic-doc-date">Data documento</Label>
              <DatePicker id="fic-doc-date" v-model="date" :disabled="submitting" />
            </div>
            <div class="space-y-2">
              <Label for="fic-doc-aggregation">Voci</Label>
              <Select v-model="aggregation" :disabled="submitting">
                <SelectTrigger id="fic-doc-aggregation" class="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="[value, label] in aggregations" :key="value" :value="value">
                    {{ label }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div v-if="aggregation === 'unica'" class="space-y-2">
            <Label for="fic-doc-description">Descrizione della voce</Label>
            <Input
              id="fic-doc-description"
              v-model="singleDescription"
              type="text"
              :disabled="submitting"
              autocomplete="off"
            />
          </div>

          <div v-if="loading" class="space-y-2">
            <Skeleton class="h-9 w-full" />
            <Skeleton class="h-24 w-full" />
          </div>

          <div v-else class="space-y-3">
            <div class="overflow-x-auto rounded-md border">
              <table class="w-full text-sm">
                <thead class="border-b bg-muted/50">
                  <tr>
                    <th class="px-3 py-2 text-left font-medium">Descrizione</th>
                    <th class="px-3 py-2 text-right font-medium">Qtà</th>
                    <th class="px-3 py-2 text-right font-medium">Prezzo</th>
                    <th class="px-3 py-2 text-right font-medium">Importo</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="!lines.length">
                    <td colspan="4" class="px-3 py-4 text-center text-muted-foreground">
                      Nessuna voce da fatturare.
                    </td>
                  </tr>
                  <tr
                    v-for="(l, i) in lines"
                    :key="i"
                    class="border-b last:border-b-0"
                    :class="l.kind === 'work' ? '' : 'italic text-muted-foreground'"
                  >
                    <td class="px-3 py-1.5">{{ l.name }}</td>
                    <td class="px-3 py-1.5 text-right tabular-nums">{{ formatHours(l.qty) }}</td>
                    <td class="px-3 py-1.5 text-right tabular-nums">{{ formatEur(l.netPrice) }}</td>
                    <td class="px-3 py-1.5 text-right tabular-nums">{{ formatEur(l.amount) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <dl v-if="totals" class="space-y-1 text-sm">
              <div
                class="flex items-center justify-between gap-4 rounded-md px-3 py-2"
                :class="{
                  'bg-muted/50': deltaLevel === 'ok',
                  'bg-amber-500/10 text-amber-700 dark:text-amber-400': deltaLevel === 'warn',
                  'bg-destructive/10 text-destructive': deltaLevel === 'block',
                }"
              >
                <dt class="flex items-center gap-2">
                  <Check v-if="deltaLevel === 'ok'" class="size-4" />
                  <AlertTriangle v-else class="size-4" />
                  Totale voci · importo fattura
                </dt>
                <dd class="tabular-nums">
                  {{ formatEur(totals.taxable) }} · {{ formatEur(invoice!.amount) }}
                  <template v-if="delta !== 0"> ({{ formatEur(delta) }})</template>
                </dd>
              </div>
              <div v-if="totals.vat" class="flex justify-between gap-4 px-3">
                <dt class="text-muted-foreground">IVA</dt>
                <dd class="tabular-nums">{{ formatEur(totals.vat) }}</dd>
              </div>
              <div v-if="totals.rivalsa" class="flex justify-between gap-4 px-3">
                <dt class="text-muted-foreground">Rivalsa INPS</dt>
                <dd class="tabular-nums">{{ formatEur(totals.rivalsa) }}</dd>
              </div>
              <div v-if="totals.cassa" class="flex justify-between gap-4 px-3">
                <dt class="text-muted-foreground">Cassa</dt>
                <dd class="tabular-nums">{{ formatEur(totals.cassa) }}</dd>
              </div>
              <div v-if="totals.stampDuty" class="flex justify-between gap-4 px-3">
                <dt class="text-muted-foreground">Marca da bollo</dt>
                <dd class="tabular-nums">{{ formatEur(totals.stampDuty) }}</dd>
              </div>
              <div v-if="totals.withholding" class="flex justify-between gap-4 px-3">
                <dt class="text-muted-foreground">Ritenuta d'acconto</dt>
                <dd class="tabular-nums">−{{ formatEur(totals.withholding) }}</dd>
              </div>
              <div class="flex justify-between gap-4 px-3 font-medium">
                <dt>Totale documento</dt>
                <dd class="tabular-nums">{{ formatEur(totals.gross) }}</dd>
              </div>
              <div class="flex justify-between gap-4 px-3">
                <dt class="text-muted-foreground">Scadenza</dt>
                <dd>
                  <template v-if="totals.exact">{{ formatDate(dueDate) }}</template>
                  <template v-else>calcolata da Fatture in Cloud</template>
                </dd>
              </div>
            </dl>

            <p v-if="config && config.vatId == null" class="text-sm text-destructive">
              Il tipo IVA non è configurato su questo connettore: aprilo dalla pagina Integrazioni e
              scegli il tipo IVA nei parametri fattura.
            </p>
            <p v-else-if="deltaLevel === 'block'" class="text-sm text-destructive">
              Le voci non ricostruiscono l'importo della fattura. Controlla che i contratti delle
              ore fatturate esistano ancora prima di creare il documento.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              :disabled="submitting"
              @click="handleOpenChange(false)"
            >
              Annulla
            </Button>
            <Button type="submit" size="sm" :disabled="submitting || loading || !valid">
              {{ submitting ? 'Creazione…' : 'Crea su Fatture in Cloud' }}
            </Button>
          </DialogFooter>
        </form>
      </template>
    </DialogContent>
  </Dialog>
</template>
