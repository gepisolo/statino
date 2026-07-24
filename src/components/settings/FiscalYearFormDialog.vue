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
import { fiscalYearsRepo, extractErrorMessage } from '@/lib/db';
import { useAuthStore } from '@/stores/auth';
import type { FiscalRegime, FiscalYear } from '@/types/models';

type Mode = 'create' | 'edit';

const props = defineProps<{
  open: boolean;
  mode: Mode;
  fiscalYear: FiscalYear | null;
  // Years already configured, to reject duplicates (one row per year).
  existing: FiscalYear[];
}>();

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void;
  (e: 'saved', f: FiscalYear): void;
}>();

const auth = useAuthStore();

const year = ref('');
const regime = ref<FiscalRegime>('forfettario');
const profitabilityIndex = ref('');
const submitting = ref(false);

const title = computed(() => (props.mode === 'create' ? 'Nuovo anno fiscale' : 'Modifica anno'));
const ctaLabel = computed(() => (props.mode === 'create' ? 'Crea' : 'Salva modifiche'));

const yearNum = computed(() => Number(year.value));
const indexNum = computed(() => Number(profitabilityIndex.value.replace(',', '.')));
const valid = computed(
  () =>
    Number.isInteger(yearNum.value) &&
    yearNum.value >= 2000 &&
    yearNum.value <= 2100 &&
    (regime.value === 'ordinario' ||
      (profitabilityIndex.value !== '' &&
        Number.isFinite(indexNum.value) &&
        indexNum.value > 0 &&
        indexNum.value <= 100)),
);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    if (props.mode === 'edit' && props.fiscalYear) {
      year.value = String(props.fiscalYear.year);
      regime.value = props.fiscalYear.regime;
      profitabilityIndex.value =
        props.fiscalYear.profitabilityIndex === null
          ? ''
          : String(props.fiscalYear.profitabilityIndex);
    } else {
      year.value = String(new Date().getFullYear());
      regime.value = 'forfettario';
      profitabilityIndex.value = '';
    }
  },
);

async function submit() {
  if (!valid.value) return;
  const duplicate = props.existing.some(
    (f) => f.year === yearNum.value && f.id !== props.fiscalYear?.id,
  );
  if (duplicate) {
    toast.error('Anno già configurato', {
      description: `Esiste già una riga per il ${yearNum.value}: modifica quella.`,
    });
    return;
  }
  submitting.value = true;
  try {
    const data = {
      year: yearNum.value,
      regime: regime.value,
      profitabilityIndex: regime.value === 'forfettario' ? indexNum.value : null,
    };
    const saved =
      props.mode === 'create'
        ? await fiscalYearsRepo.create(auth.uid!, data)
        : await fiscalYearsRepo.update(auth.uid!, props.fiscalYear!.id, data);
    toast.success(props.mode === 'create' ? 'Anno fiscale creato' : 'Anno fiscale aggiornato', {
      description: String(saved.year),
    });
    emit('saved', saved);
    emit('update:open', false);
  } catch (err) {
    toast.error('Impossibile salvare i dati fiscali', { description: extractErrorMessage(err) });
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
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription>
          Regime fiscale dell'anno; l'indice di redditività serve solo per il forfettario.
        </DialogDescription>
      </DialogHeader>

      <form class="space-y-4" @submit.prevent="submit">
        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-2">
            <Label for="fiscal-year">Anno</Label>
            <Input
              id="fiscal-year"
              v-model="year"
              type="number"
              min="2000"
              max="2100"
              step="1"
              :disabled="submitting"
            />
          </div>
          <div class="space-y-2">
            <Label for="fiscal-regime">Regime</Label>
            <Select v-model="regime" :disabled="submitting">
              <SelectTrigger id="fiscal-regime" class="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="forfettario">Forfettario</SelectItem>
                <SelectItem value="ordinario">Ordinario</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div v-if="regime === 'forfettario'" class="space-y-2">
          <Label for="fiscal-index">Indice di redditività %</Label>
          <Input
            id="fiscal-index"
            v-model="profitabilityIndex"
            type="number"
            min="1"
            max="100"
            step="0.01"
            placeholder="78"
            :disabled="submitting"
          />
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
