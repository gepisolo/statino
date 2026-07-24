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
import { taxRatesRepo, extractErrorMessage } from '@/lib/db';
import { useAuthStore } from '@/stores/auth';
import type { TaxRate, TaxRateType } from '@/types/models';

type Mode = 'create' | 'edit';

const props = defineProps<{
  open: boolean;
  mode: Mode;
  taxRate: TaxRate | null;
}>();

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void;
  (e: 'saved', r: TaxRate): void;
}>();

const auth = useAuthStore();

const year = ref('');
const type = ref<TaxRateType>('tasse');
const name = ref('');
const rate = ref('');
const fromIncome = ref('');
const toIncome = ref('');
const submitting = ref(false);

const title = computed(() => (props.mode === 'create' ? 'Nuova aliquota' : 'Modifica aliquota'));
const ctaLabel = computed(() => (props.mode === 'create' ? 'Crea' : 'Salva modifiche'));

const yearNum = computed(() => Number(year.value));
const rateNum = computed(() => Number(rate.value.replace(',', '.')));
const fromNum = computed(() => Number(fromIncome.value.replace(',', '.')));
const toNum = computed(() =>
  toIncome.value.trim() === '' ? null : Number(toIncome.value.replace(',', '.')),
);
const valid = computed(
  () =>
    Number.isInteger(yearNum.value) &&
    yearNum.value >= 2000 &&
    yearNum.value <= 2100 &&
    name.value.trim().length > 0 &&
    rate.value !== '' &&
    Number.isFinite(rateNum.value) &&
    rateNum.value > 0 &&
    rateNum.value <= 100 &&
    fromIncome.value !== '' &&
    Number.isFinite(fromNum.value) &&
    fromNum.value >= 0 &&
    (toNum.value === null || (Number.isFinite(toNum.value) && toNum.value > fromNum.value)),
);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    if (props.mode === 'edit' && props.taxRate) {
      year.value = String(props.taxRate.year);
      type.value = props.taxRate.type;
      name.value = props.taxRate.name;
      rate.value = String(props.taxRate.rate);
      fromIncome.value = String(props.taxRate.fromIncome);
      toIncome.value = props.taxRate.toIncome === null ? '' : String(props.taxRate.toIncome);
    } else {
      year.value = String(new Date().getFullYear());
      type.value = 'tasse';
      name.value = '';
      rate.value = '';
      fromIncome.value = '0';
      toIncome.value = '';
    }
  },
);

async function submit() {
  if (!valid.value) return;
  submitting.value = true;
  try {
    const data = {
      year: yearNum.value,
      type: type.value,
      name: name.value.trim(),
      rate: rateNum.value,
      fromIncome: fromNum.value,
      toIncome: toNum.value,
    };
    const saved =
      props.mode === 'create'
        ? await taxRatesRepo.create(auth.uid!, data)
        : await taxRatesRepo.update(auth.uid!, props.taxRate!.id, data);
    toast.success(props.mode === 'create' ? 'Aliquota creata' : 'Aliquota aggiornata', {
      description: saved.name,
    });
    emit('saved', saved);
    emit('update:open', false);
  } catch (err) {
    toast.error("Impossibile salvare l'aliquota", { description: extractErrorMessage(err) });
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
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription>
          L'aliquota si applica alla fascia di imponibile tra i due importi; lascia vuoto "A
          imponibile" per nessun limite superiore.
        </DialogDescription>
      </DialogHeader>

      <form class="space-y-4" @submit.prevent="submit">
        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-2">
            <Label for="rate-year">Anno</Label>
            <Input
              id="rate-year"
              v-model="year"
              type="number"
              min="2000"
              max="2100"
              step="1"
              :disabled="submitting"
            />
          </div>
          <div class="space-y-2">
            <Label for="rate-type">Tipo</Label>
            <Select v-model="type" :disabled="submitting">
              <SelectTrigger id="rate-type" class="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tasse">Tasse</SelectItem>
                <SelectItem value="contributi">Contributi</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div class="grid grid-cols-[1fr_8rem] gap-4">
          <div class="space-y-2">
            <Label for="rate-name">Nome</Label>
            <Input
              id="rate-name"
              v-model="name"
              type="text"
              placeholder="Imposta sostitutiva"
              :disabled="submitting"
              autocomplete="off"
            />
          </div>
          <div class="space-y-2">
            <Label for="rate-rate">Aliquota %</Label>
            <Input
              id="rate-rate"
              v-model="rate"
              type="number"
              min="0.01"
              max="100"
              step="0.01"
              placeholder="15"
              :disabled="submitting"
            />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-2">
            <Label for="rate-from">Da imponibile €</Label>
            <Input
              id="rate-from"
              v-model="fromIncome"
              type="number"
              min="0"
              step="0.01"
              :disabled="submitting"
            />
          </div>
          <div class="space-y-2">
            <Label for="rate-to">A imponibile €</Label>
            <Input
              id="rate-to"
              v-model="toIncome"
              type="number"
              min="0"
              step="0.01"
              placeholder="nessun limite"
              :disabled="submitting"
            />
          </div>
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
            {{ submitting ? 'Salvataggio…' : ctaLabel }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
