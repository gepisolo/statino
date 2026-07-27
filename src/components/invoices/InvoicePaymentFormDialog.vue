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
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { invoicesRepo, extractErrorMessage } from '@/lib/db';
import { formatEur, parseDecimal, todayIso } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';
import type { Invoice } from '@/types/models';

const props = defineProps<{
  open: boolean;
  invoice: Invoice | null;
}>();

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void;
  (e: 'saved', i: Invoice): void;
}>();

const auth = useAuthStore();

const date = ref('');
const amount = ref<string | number>('');
const description = ref('');
const submitting = ref(false);

const amountNum = computed(() => parseDecimal(amount.value));
const valid = computed(
  () =>
    /^\d{4}-\d{2}-\d{2}$/.test(date.value) &&
    amount.value !== '' &&
    Number.isFinite(amountNum.value) &&
    amountNum.value > 0,
);

watch(
  () => props.open,
  (open) => {
    if (!open || !props.invoice) return;
    const p = props.invoice.payment;
    date.value = p?.date ?? todayIso();
    // Collecting the full invoiced amount is the common case.
    amount.value = p?.amount ?? props.invoice.amount;
    description.value = p?.description ?? '';
  },
);

async function submit() {
  if (!valid.value || !props.invoice) return;
  submitting.value = true;
  const invoice = props.invoice;
  try {
    const payment = {
      date: date.value,
      amount: amountNum.value,
      description: description.value.trim(),
    };
    await invoicesRepo.setPayment(auth.uid!, invoice.id, payment);
    toast.success('Incasso registrato', {
      description: `${invoice.number} · ${formatEur(payment.amount)}`,
    });
    emit('saved', { ...invoice, payment });
    emit('update:open', false);
  } catch (err) {
    toast.error("Impossibile salvare l'incasso", { description: extractErrorMessage(err) });
  } finally {
    submitting.value = false;
  }
}

async function removePayment() {
  if (!props.invoice) return;
  submitting.value = true;
  const invoice = props.invoice;
  try {
    await invoicesRepo.setPayment(auth.uid!, invoice.id, null);
    toast.success('Incasso rimosso', { description: invoice.number });
    emit('saved', { ...invoice, payment: null });
    emit('update:open', false);
  } catch (err) {
    toast.error("Impossibile rimuovere l'incasso", { description: extractErrorMessage(err) });
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
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Incasso fattura {{ invoice?.number }}</DialogTitle>
        <DialogDescription>
          Quanto è stato effettivamente incassato: può non coincidere con l'importo fatturato
          <template v-if="invoice"> ({{ formatEur(invoice.amount) }})</template>.
        </DialogDescription>
      </DialogHeader>

      <form class="space-y-4" @submit.prevent="submit">
        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-2">
            <Label for="payment-date">Data</Label>
            <DatePicker id="payment-date" v-model="date" :disabled="submitting" />
          </div>
          <div class="space-y-2">
            <Label for="payment-amount">Importo €</Label>
            <Input
              id="payment-amount"
              v-model="amount"
              type="number"
              min="0.01"
              step="0.01"
              :disabled="submitting"
            />
          </div>
        </div>

        <div class="space-y-2">
          <Label for="payment-description">Descrizione</Label>
          <Input
            id="payment-description"
            v-model="description"
            type="text"
            placeholder="Bonifico, note…"
            :disabled="submitting"
            autocomplete="off"
          />
        </div>

        <DialogFooter>
          <Button
            v-if="invoice?.payment"
            type="button"
            variant="outline"
            size="sm"
            class="text-destructive"
            :disabled="submitting"
            @click="removePayment"
          >
            Rimuovi incasso
          </Button>
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
            {{ submitting ? 'Salvataggio…' : 'Salva' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
