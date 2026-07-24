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
import { Textarea } from '@/components/ui/textarea';
import { entriesRepo, extractErrorMessage } from '@/lib/db';
import { formatDate, weekdayName } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';
import type { Contract, Entry, Project } from '@/types/models';

type Mode = 'create' | 'edit';

const props = defineProps<{
  open: boolean;
  mode: Mode;
  entry: Entry | null;
  // Day the entry belongs to (create mode) — ignored in edit mode.
  date: string;
  clientId: string;
  // Contracts of the client selectable for this day (active ones, plus the
  // entry's own contract when editing).
  contracts: Contract[];
  projects: Project[];
}>();

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void;
  (e: 'saved', entry: Entry): void;
}>();

const auth = useAuthStore();

const NO_PROJECT = 'none';

const contractId = ref('');
const projectId = ref(NO_PROJECT);
const ticket = ref('');
const link = ref('');
const description = ref('');
const hours = ref('');
const submitting = ref(false);

const entryDate = computed(() =>
  props.mode === 'edit' && props.entry ? props.entry.date : props.date,
);
const title = computed(() => (props.mode === 'create' ? 'Nuova attività' : 'Modifica attività'));
const ctaLabel = computed(() => (props.mode === 'create' ? 'Aggiungi' : 'Salva modifiche'));

// Inactive projects are hidden, but the one already on the entry being
// edited stays selectable.
const selectableProjects = computed(() =>
  props.projects.filter(
    (p) => p.active !== false || (props.mode === 'edit' && props.entry?.projectId === p.id),
  ),
);

const hoursNum = computed(() => Number(hours.value));
const valid = computed(
  () =>
    contractId.value !== '' &&
    hours.value !== '' &&
    Number.isFinite(hoursNum.value) &&
    hoursNum.value > 0,
);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    if (props.mode === 'edit' && props.entry) {
      contractId.value = props.entry.contractId;
      projectId.value = props.entry.projectId ?? NO_PROJECT;
      ticket.value = props.entry.ticket;
      link.value = props.entry.link;
      description.value = props.entry.description;
      hours.value = String(props.entry.hours);
    } else {
      contractId.value = props.contracts.length === 1 ? props.contracts[0].id : '';
      projectId.value = NO_PROJECT;
      ticket.value = '';
      link.value = '';
      description.value = '';
      hours.value = '';
    }
  },
);

async function submit() {
  if (!valid.value) return;
  submitting.value = true;
  try {
    let url = link.value.trim();
    if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
    const data = {
      date: entryDate.value,
      clientId: props.clientId,
      contractId: contractId.value,
      projectId: projectId.value === NO_PROJECT ? null : projectId.value,
      ticket: ticket.value.trim(),
      link: url,
      description: description.value.trim(),
      hours: hoursNum.value,
    };
    const saved =
      props.mode === 'create'
        ? await entriesRepo.create(auth.uid!, data)
        : await entriesRepo.update(auth.uid!, props.entry!.id, data);
    toast.success(props.mode === 'create' ? 'Attività aggiunta' : 'Attività aggiornata');
    emit('saved', saved);
    emit('update:open', false);
  } catch (err) {
    toast.error(
      props.mode === 'create'
        ? "Impossibile aggiungere l'attività"
        : "Impossibile salvare l'attività",
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
          {{ weekdayName(entryDate) }} {{ formatDate(entryDate) }}
        </DialogDescription>
      </DialogHeader>

      <form class="space-y-4" @submit.prevent="submit">
        <div class="space-y-2">
          <Label for="entry-contract">Contratto</Label>
          <Select v-model="contractId" :disabled="submitting">
            <SelectTrigger id="entry-contract" class="w-full">
              <SelectValue placeholder="Seleziona il contratto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="c in contracts" :key="c.id" :value="c.id">
                {{ c.activity }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div class="space-y-2">
          <Label for="entry-project">Progetto</Label>
          <Select v-model="projectId" :disabled="submitting">
            <SelectTrigger id="entry-project" class="w-full">
              <SelectValue placeholder="Nessun progetto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem :value="NO_PROJECT">Nessun progetto</SelectItem>
              <SelectItem v-for="p in selectableProjects" :key="p.id" :value="p.id">
                {{ p.name }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-2">
            <Label for="entry-ticket">Ticket</Label>
            <Input
              id="entry-ticket"
              v-model="ticket"
              type="text"
              placeholder="7592"
              :disabled="submitting"
              autocomplete="off"
            />
          </div>
          <div class="space-y-2">
            <Label for="entry-hours">Ore</Label>
            <Input
              id="entry-hours"
              v-model="hours"
              type="number"
              min="0.25"
              step="0.25"
              placeholder="2"
              :disabled="submitting"
            />
          </div>
        </div>

        <div class="space-y-2">
          <Label for="entry-link">Link</Label>
          <Input
            id="entry-link"
            v-model="link"
            type="text"
            placeholder="https://tracker.esempio.com/issues/7592"
            :disabled="submitting"
            autocomplete="off"
          />
        </div>

        <div class="space-y-2">
          <Label for="entry-description">Descrizione</Label>
          <Textarea
            id="entry-description"
            v-model="description"
            placeholder="Cosa hai fatto…"
            rows="2"
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
