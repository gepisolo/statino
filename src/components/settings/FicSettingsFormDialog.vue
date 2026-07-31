<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { toast } from 'vue-sonner';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { integrationsRepo, extractErrorMessage } from '@/lib/db';
import { AGGREGATION_LABELS, type FicPaymentMethod, type FicVatType } from '@/lib/fattureincloud';
import { ficErrorMessage, ficPaymentMethods, ficVatTypes } from '@/lib/fattureincloudApi';
import { parseDecimal } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';
import type { FicAggregation, FicConfig } from '@/types/models';

const props = defineProps<{
  open: boolean;
  config: FicConfig | null;
}>();

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void;
  (e: 'saved', c: FicConfig): void;
}>();

const auth = useAuthStore();

const loading = ref(false);
const submitting = ref(false);
const vatTypes = ref<FicVatType[]>([]);
const paymentMethods = ref<FicPaymentMethod[]>([]);

const numeration = ref('');
const vatId = ref('');
const paymentMethodId = ref('');
const paymentDueDays = ref<string | number>(30);
const includePeriodSubject = ref(true);
const defaultAggregation = ref<FicAggregation>('contratto');
const eInvoice = ref(true);
const eiPaymentMethodCode = ref('MP05');
const stampDuty = ref<string | number>('');
const stampDutyThreshold = ref<string | number>(77.47);
const rivalsa = ref<string | number>(0);
const cassa = ref<string | number>(0);
const withholdingTax = ref<string | number>(0);
const withholdingTaxTaxable = ref<string | number>(100);
const notes = ref('');

const dueDaysNum = computed(() => Number(paymentDueDays.value));
const stampDutyNum = computed(() => (stampDuty.value === '' ? 0 : parseDecimal(stampDuty.value)));
const thresholdNum = computed(() =>
  stampDutyThreshold.value === '' ? 0 : parseDecimal(stampDutyThreshold.value),
);
const percents = computed(() =>
  [rivalsa, cassa, withholdingTax, withholdingTaxTaxable].map((r) =>
    r.value === '' ? NaN : parseDecimal(r.value),
  ),
);

const valid = computed(
  () =>
    vatId.value !== '' &&
    Number.isInteger(dueDaysNum.value) &&
    dueDaysNum.value >= 0 &&
    dueDaysNum.value <= 365 &&
    Number.isFinite(stampDutyNum.value) &&
    stampDutyNum.value >= 0 &&
    Number.isFinite(thresholdNum.value) &&
    thresholdNum.value >= 0 &&
    percents.value.every((p) => Number.isFinite(p) && p >= 0 && p <= 100) &&
    (!eInvoice.value || eiPaymentMethodCode.value.trim().length > 0),
);

watch(
  () => props.open,
  async (open) => {
    const c = props.config;
    if (!open || !c) return;
    numeration.value = c.numeration;
    vatId.value = c.vatId ? String(c.vatId) : '';
    paymentMethodId.value = c.paymentMethodId ? String(c.paymentMethodId) : '';
    paymentDueDays.value = c.paymentDueDays;
    includePeriodSubject.value = c.includePeriodSubject;
    defaultAggregation.value = c.defaultAggregation;
    eInvoice.value = c.eInvoice;
    eiPaymentMethodCode.value = c.eiPaymentMethodCode;
    stampDuty.value = c.stampDuty || '';
    stampDutyThreshold.value = c.stampDutyThreshold;
    rivalsa.value = c.rivalsa;
    cassa.value = c.cassa;
    withholdingTax.value = c.withholdingTax;
    withholdingTaxTaxable.value = c.withholdingTaxTaxable;
    notes.value = c.notes;

    // Tipi IVA e metodi di pagamento sono id dell'account FIC, non valori
    // universali: si leggono da loro, e solo all'apertura del dialog.
    loading.value = true;
    try {
      [vatTypes.value, paymentMethods.value] = await Promise.all([
        ficVatTypes(c.companyId),
        ficPaymentMethods(c.companyId),
      ]);
    } catch (err) {
      toast.error('Impossibile leggere le impostazioni da Fatture in Cloud', {
        description: ficErrorMessage(err),
      });
    } finally {
      loading.value = false;
    }
  },
);

async function submit() {
  const c = props.config;
  if (!valid.value || !c) return;
  const vat = vatTypes.value.find((v) => String(v.id) === vatId.value);
  const method = paymentMethods.value.find((m) => String(m.id) === paymentMethodId.value);
  submitting.value = true;
  try {
    const [rivalsaN, cassaN, withholdingN, withholdingTaxableN] = percents.value;
    // ⚠️ setDoc pieno: si riparte dalla config corrente, così azienda,
    // token hint e mappature restano al loro posto.
    const saved = await integrationsRepo.saveFic(auth.uid!, {
      ...c,
      numeration: numeration.value.trim(),
      vatId: Number(vatId.value),
      vatValue: vat?.value ?? 0,
      vatDescription: vat?.description ?? '',
      paymentMethodId: method ? method.id : null,
      paymentMethodName: method?.name ?? '',
      paymentDueDays: dueDaysNum.value,
      includePeriodSubject: includePeriodSubject.value,
      defaultAggregation: defaultAggregation.value,
      eInvoice: eInvoice.value,
      eiPaymentMethodCode: eInvoice.value ? eiPaymentMethodCode.value.trim() : '',
      stampDuty: stampDutyNum.value,
      stampDutyThreshold: thresholdNum.value,
      rivalsa: rivalsaN,
      cassa: cassaN,
      withholdingTax: withholdingN,
      withholdingTaxTaxable: withholdingTaxableN,
      notes: notes.value.trim(),
    });
    toast.success('Parametri fattura aggiornati');
    emit('saved', saved);
    emit('update:open', false);
  } catch (err) {
    toast.error('Impossibile salvare i parametri', { description: extractErrorMessage(err) });
  } finally {
    submitting.value = false;
  }
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
      <DialogHeader>
        <DialogTitle>Parametri fattura</DialogTitle>
        <DialogDescription>
          Valori applicati a ogni documento creato su Fatture in Cloud. Il numero non è qui: il
          progressivo lo assegna sempre FIC.
        </DialogDescription>
      </DialogHeader>

      <div v-if="loading" class="space-y-3">
        <Skeleton class="h-9 w-full" />
        <Skeleton class="h-9 w-full" />
        <Skeleton class="h-9 w-full" />
      </div>

      <form v-else class="space-y-6" @submit.prevent="submit">
        <section class="space-y-4">
          <h3 class="text-sm font-medium">Documento</h3>
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="space-y-2">
              <Label for="fic-numeration">Numerazione (sezionale)</Label>
              <Input
                id="fic-numeration"
                v-model="numeration"
                type="text"
                placeholder="predefinita"
                :disabled="submitting"
                autocomplete="off"
              />
            </div>
            <div class="space-y-2">
              <Label for="fic-aggregation">Aggregazione predefinita</Label>
              <Select v-model="defaultAggregation" :disabled="submitting">
                <SelectTrigger id="fic-aggregation" class="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="[value, label] in aggregations" :key="value" :value="value">
                    {{ label }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="space-y-2">
              <Label for="fic-method">Metodo di pagamento</Label>
              <Select v-model="paymentMethodId" :disabled="submitting">
                <SelectTrigger id="fic-method" class="w-full">
                  <SelectValue placeholder="Nessuno" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="m in paymentMethods" :key="m.id" :value="String(m.id)">
                    {{ m.name }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="space-y-2">
              <Label for="fic-due">Giorni di scadenza</Label>
              <Input
                id="fic-due"
                v-model="paymentDueDays"
                type="number"
                min="0"
                max="365"
                step="1"
                :disabled="submitting"
              />
            </div>
          </div>
          <label class="flex items-center gap-3 text-sm">
            <Switch v-model="includePeriodSubject" :disabled="submitting" />
            Scrivi in fattura il periodo di riferimento
          </label>
        </section>

        <section class="space-y-4">
          <h3 class="text-sm font-medium">Fiscali</h3>
          <div class="space-y-2">
            <Label for="fic-vat">Tipo IVA / natura</Label>
            <Select v-model="vatId" :disabled="submitting">
              <SelectTrigger id="fic-vat" class="w-full">
                <SelectValue placeholder="Scegli il tipo IVA" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="v in vatTypes" :key="v.id" :value="String(v.id)">
                  {{ v.description }} ({{ v.value }}%)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="space-y-2">
              <Label for="fic-stamp">Marca da bollo €</Label>
              <Input
                id="fic-stamp"
                v-model="stampDuty"
                type="number"
                min="0"
                step="0.01"
                placeholder="nessuna"
                :disabled="submitting"
              />
            </div>
            <div class="space-y-2">
              <Label for="fic-stamp-threshold">Applica il bollo oltre €</Label>
              <Input
                id="fic-stamp-threshold"
                v-model="stampDutyThreshold"
                type="number"
                min="0"
                step="0.01"
                :disabled="submitting"
              />
            </div>
          </div>
          <p class="text-xs text-muted-foreground">
            Fatture in Cloud somma il bollo al totale del documento: resta fuori dal confronto con
            l'importo della fattura statino.
          </p>
          <div class="grid gap-4 sm:grid-cols-4">
            <div class="space-y-2">
              <Label for="fic-rivalsa">Rivalsa INPS %</Label>
              <Input
                id="fic-rivalsa"
                v-model="rivalsa"
                type="number"
                min="0"
                max="100"
                step="0.01"
                :disabled="submitting"
              />
            </div>
            <div class="space-y-2">
              <Label for="fic-cassa">Cassa %</Label>
              <Input
                id="fic-cassa"
                v-model="cassa"
                type="number"
                min="0"
                max="100"
                step="0.01"
                :disabled="submitting"
              />
            </div>
            <div class="space-y-2">
              <Label for="fic-withholding">Ritenuta %</Label>
              <Input
                id="fic-withholding"
                v-model="withholdingTax"
                type="number"
                min="0"
                max="100"
                step="0.01"
                :disabled="submitting"
              />
            </div>
            <div class="space-y-2">
              <Label for="fic-withholding-taxable">su imponibile %</Label>
              <Input
                id="fic-withholding-taxable"
                v-model="withholdingTaxTaxable"
                type="number"
                min="0"
                max="100"
                step="0.01"
                :disabled="submitting"
              />
            </div>
          </div>
        </section>

        <section class="space-y-4">
          <h3 class="text-sm font-medium">Fattura elettronica</h3>
          <label class="flex items-center gap-3 text-sm">
            <Switch v-model="eInvoice" :disabled="submitting" />
            Crea il documento come fattura elettronica
          </label>
          <div v-if="eInvoice" class="space-y-2">
            <Label for="fic-ei-method">Modalità di pagamento (codice SdI)</Label>
            <Input
              id="fic-ei-method"
              v-model="eiPaymentMethodCode"
              type="text"
              placeholder="MP05"
              class="sm:max-w-40"
              :disabled="submitting"
              autocomplete="off"
            />
            <p class="text-xs text-muted-foreground">
              MP05 bonifico, MP01 contanti, MP08 carta. L'invio allo SdI resta un passo manuale su
              Fatture in Cloud.
            </p>
          </div>
        </section>

        <section class="space-y-2">
          <Label for="fic-notes">Dicitura in fattura</Label>
          <Textarea
            id="fic-notes"
            v-model="notes"
            rows="3"
            placeholder="Operazione non soggetta a IVA ai sensi dell'art. 1, commi 54-89, L. 190/2014…"
            :disabled="submitting"
          />
        </section>

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
          <Button type="submit" size="sm" :disabled="submitting || !valid">
            {{ submitting ? 'Salvataggio…' : 'Salva parametri' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
