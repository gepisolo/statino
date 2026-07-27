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
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { entriesRepo, invoicesRepo, extractErrorMessage } from '@/lib/db';
import { formatEur, formatHours, parseDecimal, todayIso } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';
import type { Client, Contract, Entry, Invoice } from '@/types/models';

const props = defineProps<{
  open: boolean;
  clients: Client[];
  contracts: Contract[];
}>();

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void;
  (e: 'saved', invoice: Invoice): void;
}>();

const auth = useAuthStore();

const clientId = ref('');
const number = ref('');
const date = ref('');
const dateFrom = ref('');
const dateTo = ref('');
const discount = ref<string | number>('');
const discountReason = ref('');
const submitting = ref(false);

// Entries loaded for the selected period (any client), then narrowed to
// the billable ones: selected client, not yet invoiced.
const rangeEntries = ref<Entry[]>([]);
const loadingEntries = ref(false);

const rangeValid = computed(
  () =>
    /^\d{4}-\d{2}-\d{2}$/.test(dateFrom.value) &&
    /^\d{4}-\d{2}-\d{2}$/.test(dateTo.value) &&
    dateFrom.value <= dateTo.value,
);

const billable = computed(() =>
  rangeEntries.value.filter((e) => e.clientId === clientId.value && !e.invoiceId),
);

const rateByContract = computed(() => new Map(props.contracts.map((c) => [c.id, c.hourlyRate])));
const totalHours = computed(() => billable.value.reduce((sum, e) => sum + e.hours, 0));
const totalAmount = computed(() =>
  billable.value.reduce(
    (sum, e) => sum + e.hours * (rateByContract.value.get(e.contractId) ?? 0),
    0,
  ),
);

const discountNum = computed(() => parseDecimal(discount.value));
const hasDiscount = computed(
  () => discount.value !== '' && Number.isFinite(discountNum.value) && discountNum.value > 0,
);
// Empty = no discount; when set it needs a reason and can't exceed the
// billed amount (the invoice total never goes negative).
const discountValid = computed(
  () =>
    discount.value === '' ||
    (hasDiscount.value &&
      discountNum.value <= totalAmount.value &&
      discountReason.value.trim().length > 0),
);
const finalAmount = computed(() => totalAmount.value - (hasDiscount.value ? discountNum.value : 0));

const valid = computed(
  () =>
    clientId.value !== '' &&
    number.value.trim().length > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(date.value) &&
    rangeValid.value &&
    billable.value.length > 0 &&
    discountValid.value,
);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    clientId.value = props.clients.length === 1 ? props.clients[0].id : '';
    number.value = '';
    date.value = todayIso();
    dateFrom.value = '';
    dateTo.value = '';
    discount.value = '';
    discountReason.value = '';
    rangeEntries.value = [];
  },
);

watch([() => props.open, dateFrom, dateTo], async ([open]) => {
  if (!open || !rangeValid.value) {
    rangeEntries.value = [];
    return;
  }
  loadingEntries.value = true;
  try {
    rangeEntries.value = await entriesRepo.listRange(auth.uid!, dateFrom.value, dateTo.value);
  } catch (err) {
    toast.error('Impossibile calcolare le ore del periodo', {
      description: extractErrorMessage(err),
    });
  } finally {
    loadingEntries.value = false;
  }
});

async function submit() {
  if (!valid.value) return;
  submitting.value = true;
  try {
    const saved = await invoicesRepo.createWithEntries(
      auth.uid!,
      {
        clientId: clientId.value,
        number: number.value.trim(),
        date: date.value,
        dateFrom: dateFrom.value,
        dateTo: dateTo.value,
        hours: totalHours.value,
        amount: finalAmount.value,
        discount: hasDiscount.value
          ? { amount: discountNum.value, reason: discountReason.value.trim() }
          : null,
      },
      billable.value.map((e) => e.id),
    );
    toast.success('Fattura salvata', {
      description: `${saved.number} — ${billable.value.length} attività bloccate`,
    });
    emit('saved', saved);
    emit('update:open', false);
  } catch (err) {
    toast.error('Impossibile salvare la fattura', { description: extractErrorMessage(err) });
  } finally {
    submitting.value = false;
  }
}

function handleOpenChange(v: boolean) {
  if (submitting.value) return;
  emit('update:open', v);
}
</script>

<template>
  <Dialog :open="open" @update:open="handleOpenChange">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Nuova fattura</DialogTitle>
        <DialogDescription>
          Le attività del periodo non ancora fatturate vengono conteggiate e bloccate al
          salvataggio.
        </DialogDescription>
      </DialogHeader>

      <form class="space-y-4" @submit.prevent="submit">
        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-2">
            <Label for="invoice-client">Cliente</Label>
            <Select v-model="clientId" :disabled="submitting">
              <SelectTrigger id="invoice-client" class="w-full">
                <SelectValue placeholder="Seleziona un cliente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="c in clients" :key="c.id" :value="c.id">
                  {{ c.name }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="space-y-2">
            <Label for="invoice-number">Numero</Label>
            <Input
              id="invoice-number"
              v-model="number"
              type="text"
              placeholder="2026/12"
              :disabled="submitting"
              autocomplete="off"
            />
          </div>
        </div>

        <div class="grid grid-cols-3 gap-4">
          <div class="space-y-2">
            <Label for="invoice-date">Data fattura</Label>
            <DatePicker id="invoice-date" v-model="date" :disabled="submitting" />
          </div>
          <div class="space-y-2">
            <Label for="invoice-from">Dal</Label>
            <DatePicker id="invoice-from" v-model="dateFrom" :disabled="submitting" />
          </div>
          <div class="space-y-2">
            <Label for="invoice-to">Al</Label>
            <DatePicker id="invoice-to" v-model="dateTo" :disabled="submitting" />
          </div>
        </div>

        <div class="grid grid-cols-3 gap-4">
          <div class="space-y-2">
            <Label for="invoice-discount">Sconto €</Label>
            <Input
              id="invoice-discount"
              v-model="discount"
              type="number"
              min="0.01"
              step="0.01"
              :disabled="submitting"
            />
          </div>
          <div class="col-span-2 space-y-2">
            <Label for="invoice-discount-reason">Motivazione sconto</Label>
            <Input
              id="invoice-discount-reason"
              v-model="discountReason"
              type="text"
              placeholder="Ore non conteggiate, accordo…"
              :disabled="submitting"
              autocomplete="off"
            />
          </div>
        </div>
        <p v-if="discount !== '' && !discountValid" class="text-xs text-destructive">
          Lo sconto richiede una motivazione e non può superare l'importo delle attività.
        </p>

        <div class="rounded-md border bg-muted/40 px-4 py-3">
          <template v-if="!clientId || !rangeValid">
            <p class="text-sm text-muted-foreground">
              Scegli cliente e periodo per vedere ore e importo.
            </p>
          </template>
          <template v-else-if="loadingEntries">
            <p class="text-sm text-muted-foreground">Calcolo…</p>
          </template>
          <template v-else>
            <div class="flex items-baseline justify-between">
              <span class="text-sm text-muted-foreground">
                {{ billable.length }} attività da fatturare
              </span>
              <span class="text-sm tabular-nums">{{ formatHours(totalHours) }} h</span>
            </div>
            <template v-if="hasDiscount">
              <div class="mt-1 flex items-baseline justify-between">
                <span class="text-sm text-muted-foreground">Importo</span>
                <span class="text-sm tabular-nums">{{ formatEur(totalAmount) }}</span>
              </div>
              <div class="mt-1 flex items-baseline justify-between">
                <span class="text-sm text-muted-foreground">Sconto</span>
                <span class="text-sm tabular-nums">−{{ formatEur(discountNum) }}</span>
              </div>
              <div class="mt-1 flex items-baseline justify-between">
                <span class="text-sm text-muted-foreground">Totale</span>
                <span class="text-xl font-semibold tabular-nums">{{ formatEur(finalAmount) }}</span>
              </div>
            </template>
            <div v-else class="mt-1 flex items-baseline justify-between">
              <span class="text-sm text-muted-foreground">Importo</span>
              <span class="text-xl font-semibold tabular-nums">{{ formatEur(totalAmount) }}</span>
            </div>
            <p v-if="!billable.length" class="mt-1 text-sm text-muted-foreground">
              Nessuna attività non fatturata nel periodo per questo cliente.
            </p>
          </template>
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
          <Button type="submit" size="sm" :disabled="submitting || !valid">
            {{ submitting ? 'Salvataggio…' : 'Salva fattura' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
