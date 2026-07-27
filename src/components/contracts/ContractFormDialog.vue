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
import { contractsRepo, extractErrorMessage } from '@/lib/db';
import { useAuthStore } from '@/stores/auth';
import type { Client, Contract } from '@/types/models';

type Mode = 'create' | 'edit';

const props = defineProps<{
  open: boolean;
  mode: Mode;
  contract: Contract | null;
  clients: Client[];
}>();

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void;
  (e: 'saved', c: Contract): void;
}>();

const auth = useAuthStore();

const clientId = ref('');
const activity = ref('');
const startDate = ref('');
const endDate = ref('');
const annualHours = ref('');
const hourlyRate = ref('');
const submitting = ref(false);

const title = computed(() => (props.mode === 'create' ? 'Nuovo contratto' : 'Modifica contratto'));
const ctaLabel = computed(() => (props.mode === 'create' ? 'Crea contratto' : 'Salva modifiche'));

const annualHoursNum = computed(() => Number(annualHours.value));
const hourlyRateNum = computed(() => Number(hourlyRate.value));

const datesValid = computed(
  () => startDate.value !== '' && endDate.value !== '' && startDate.value <= endDate.value,
);
const valid = computed(
  () =>
    clientId.value !== '' &&
    activity.value.trim() !== '' &&
    datesValid.value &&
    annualHours.value !== '' &&
    Number.isFinite(annualHoursNum.value) &&
    annualHoursNum.value > 0 &&
    hourlyRate.value !== '' &&
    Number.isFinite(hourlyRateNum.value) &&
    hourlyRateNum.value >= 0,
);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    if (props.mode === 'edit' && props.contract) {
      clientId.value = props.contract.clientId;
      activity.value = props.contract.activity;
      startDate.value = props.contract.startDate;
      endDate.value = props.contract.endDate;
      annualHours.value = String(props.contract.annualHours);
      hourlyRate.value = String(props.contract.hourlyRate);
    } else {
      clientId.value = props.clients.length === 1 ? props.clients[0].id : '';
      activity.value = '';
      startDate.value = '';
      endDate.value = '';
      annualHours.value = '';
      hourlyRate.value = '';
    }
  },
);

async function submit() {
  if (!valid.value) return;
  submitting.value = true;
  try {
    const data = {
      clientId: clientId.value,
      activity: activity.value.trim(),
      startDate: startDate.value,
      endDate: endDate.value,
      annualHours: annualHoursNum.value,
      hourlyRate: hourlyRateNum.value,
    };
    const saved =
      props.mode === 'create'
        ? await contractsRepo.create(auth.uid!, data)
        : await contractsRepo.update(auth.uid!, props.contract!.id, data);
    toast.success(props.mode === 'create' ? 'Contratto creato' : 'Contratto aggiornato', {
      description: saved.activity,
    });
    emit('saved', saved);
    emit('update:open', false);
  } catch (err) {
    toast.error(
      props.mode === 'create'
        ? 'Impossibile creare il contratto'
        : 'Impossibile salvare il contratto',
      { description: extractErrorMessage(err) },
    );
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
          Un contratto vale per una singola attività: lo stesso cliente può avere contratti con
          tariffe diverse per attività diverse. Il monte ore è conteggiato per anno solare.
        </DialogDescription>
      </DialogHeader>

      <form class="space-y-4" @submit.prevent="submit">
        <div class="space-y-2">
          <Label for="contract-client">Cliente</Label>
          <Select v-model="clientId" :disabled="submitting">
            <SelectTrigger id="contract-client" class="w-full">
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
          <Label for="contract-activity">Attività</Label>
          <Input
            id="contract-activity"
            v-model="activity"
            type="text"
            placeholder="Sviluppo software"
            :disabled="submitting"
            autocomplete="off"
          />
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-2">
            <Label for="contract-start">Inizio validità</Label>
            <DatePicker id="contract-start" v-model="startDate" :disabled="submitting" />
          </div>
          <div class="space-y-2">
            <Label for="contract-end">Fine validità</Label>
            <DatePicker id="contract-end" v-model="endDate" :disabled="submitting" />
          </div>
        </div>
        <p v-if="startDate && endDate && !datesValid" class="text-xs text-destructive">
          La fine validità deve essere successiva all'inizio.
        </p>

        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-2">
            <Label for="contract-hours">Monte ore annuali</Label>
            <Input
              id="contract-hours"
              v-model="annualHours"
              type="number"
              min="1"
              step="1"
              placeholder="200"
              :disabled="submitting"
            />
          </div>
          <div class="space-y-2">
            <Label for="contract-rate">Costo orario (€)</Label>
            <Input
              id="contract-rate"
              v-model="hourlyRate"
              type="number"
              min="0"
              step="0.01"
              placeholder="50,00"
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
