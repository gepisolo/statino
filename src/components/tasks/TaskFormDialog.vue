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
import EntryFormDialog from '@/components/statino/EntryFormDialog.vue';
import { contractsRepo, projectsRepo, tasksRepo, extractErrorMessage } from '@/lib/db';
import { parseDecimal, todayIso } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';
import type { Client, Contract, Entry, Project, Task, TaskStatus } from '@/types/models';

const props = defineProps<{
  open: boolean;
  mode: 'create' | 'edit';
  task: Task | null;
  clients: Client[];
  // Full list, needed to compute the auto-increment and the position
  // on top of the column the task enters.
  tasks: Task[];
}>();

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void;
  (e: 'saved', t: Task): void;
}>();

const auth = useAuthStore();

// 'archived' is a select option, not a real status: it maps to the
// archived flag while the done outcome is kept.
type StatusOption = TaskStatus | 'archived';

const clientId = ref('');
const title = ref('');
const description = ref('');
const status = ref<StatusOption>('todo');
const hours = ref<string | number>('');
const submitting = ref(false);

const statusLabels: Record<StatusOption, string> = {
  todo: 'TODO',
  wip: 'WIP',
  done_ok: 'Done OK',
  done_ko: 'Done KO',
  archived: 'Archiviata',
};

// Archiving is only offered from Done (or when already archived).
const statusOptions = computed<StatusOption[]>(() => {
  const base: StatusOption[] = ['todo', 'wip', 'done_ok', 'done_ko'];
  const t = props.task;
  return t && (t.archived || t.status === 'done_ok' || t.status === 'done_ko')
    ? [...base, 'archived']
    : base;
});

const showHours = computed(
  () => status.value === 'done_ok' || status.value === 'done_ko' || status.value === 'archived',
);

const nextNum = computed(() => Math.max(0, ...props.tasks.map((t) => t.num)) + 1);

const hoursNum = computed(() => parseDecimal(hours.value));
const valid = computed(
  () =>
    clientId.value !== '' &&
    title.value.trim().length > 0 &&
    (!showHours.value ||
      hours.value === '' ||
      (Number.isFinite(hoursNum.value) && hoursNum.value > 0)),
);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    const t = props.task;
    clientId.value = t?.clientId ?? (props.clients.length === 1 ? props.clients[0].id : '');
    title.value = t?.title ?? '';
    description.value = t?.description ?? '';
    status.value = t ? (t.archived ? 'archived' : t.status) : 'todo';
    hours.value = t?.hours ?? '';
  },
);

function isDone(s: TaskStatus): boolean {
  return s === 'done_ok' || s === 'done_ko';
}

// Board columns: done_ok and done_ko share one, archived has its own.
function columnOf(s: TaskStatus, archived: boolean): string {
  if (archived) return 'archived';
  return isDone(s) ? 'done' : s;
}

// A task entering a column goes on top of it.
function topOrderIn(column: string, excludeId?: string): number {
  const orders = props.tasks
    .filter((t) => t.id !== excludeId && columnOf(t.status, t.archived) === column)
    .map((t) => t.order);
  return orders.length ? Math.min(...orders) - 1 : 0;
}

// --- "A statino": one-shot button on done tasks that opens the statino
// entry dialog prefilled from the ticket (only the contract is left to
// pick). Saving the entry stamps `statinoEntryId` and closes both
// dialogs; the button is gone for good afterwards. ---

const statinoOpen = ref(false);
const statinoLoading = ref(false);
const statinoContracts = ref<Contract[]>([]);
const statinoProjects = ref<Project[]>([]);

const canSendToStatino = computed(() => {
  const t = props.task;
  return props.mode === 'edit' && t !== null && isDone(t.status) && !t.statinoEntryId;
});

// Tasks done before `doneAt` existed have no close date: fall back to today.
const statinoDate = computed(() => props.task?.doneAt ?? todayIso());

const statinoPrefill = computed(() => {
  const t = props.task;
  if (!t) return null;
  return { ticket: `#${t.num}`, description: t.title, hours: t.hours };
});

async function openStatino() {
  const t = props.task!;
  statinoLoading.value = true;
  try {
    const [contracts, projects] = await Promise.all([
      contractsRepo.list(auth.uid!),
      projectsRepo.list(auth.uid!),
    ]);
    const date = statinoDate.value;
    statinoContracts.value = contracts.filter(
      (c) => c.clientId === t.clientId && c.startDate <= date && c.endDate >= date,
    );
    statinoProjects.value = projects.filter((p) => p.clientId === t.clientId);
    if (!statinoContracts.value.length) {
      toast.error('Nessun contratto del cliente attivo in quella data');
      return;
    }
    statinoOpen.value = true;
  } catch (err) {
    toast.error('Impossibile aprire lo statino', { description: extractErrorMessage(err) });
  } finally {
    statinoLoading.value = false;
  }
}

async function onStatinoSaved(entry: Entry) {
  const t = props.task!;
  try {
    const saved = await tasksRepo.update(auth.uid!, t.id, {
      num: t.num,
      clientId: t.clientId,
      title: t.title,
      description: t.description,
      status: t.status,
      archived: t.archived,
      hours: t.hours,
      order: t.order,
      createdAt: t.createdAt ?? null,
      doneAt: t.doneAt ?? null,
      statinoEntryId: entry.id,
    });
    emit('saved', saved);
    emit('update:open', false);
  } catch (err) {
    toast.error('Attività salvata in statino, ma ticket non aggiornato', {
      description: extractErrorMessage(err),
    });
  }
}

async function submit() {
  if (!valid.value) return;
  submitting.value = true;
  try {
    const base = {
      clientId: clientId.value,
      title: title.value.trim(),
      description: description.value.trim(),
      hours: showHours.value && hours.value !== '' ? hoursNum.value : null,
    };
    let saved: Task;
    if (props.mode === 'create') {
      saved = await tasksRepo.create(auth.uid!, {
        ...base,
        num: nextNum.value,
        status: 'todo',
        archived: false,
        order: topOrderIn('todo'),
        createdAt: todayIso(),
        doneAt: null,
        statinoEntryId: null,
      });
    } else {
      const t = props.task!;
      const archived = status.value === 'archived';
      // Archiving keeps the done outcome (KO stays KO, anything else
      // counts as OK).
      const newStatus: TaskStatus =
        status.value === 'archived'
          ? t.status === 'done_ko'
            ? 'done_ko'
            : 'done_ok'
          : status.value;
      const oldColumn = columnOf(t.status, t.archived);
      const newColumn = columnOf(newStatus, archived);
      // Entering Done stamps today; leaving it clears the stamp; staying
      // done keeps the original date (null on docs done before the field).
      const doneAt = !isDone(newStatus) ? null : isDone(t.status) ? (t.doneAt ?? null) : todayIso();
      saved = await tasksRepo.update(auth.uid!, t.id, {
        ...base,
        num: t.num,
        status: newStatus,
        archived,
        order: newColumn === oldColumn ? t.order : topOrderIn(newColumn, t.id),
        createdAt: t.createdAt ?? null,
        doneAt,
        statinoEntryId: t.statinoEntryId ?? null,
      });
    }
    toast.success(props.mode === 'create' ? 'Attività creata' : 'Attività aggiornata', {
      description: `#${saved.num} · ${saved.title}`,
    });
    emit('saved', saved);
    emit('update:open', false);
  } catch (err) {
    toast.error("Impossibile salvare l'attività", { description: extractErrorMessage(err) });
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
        <DialogTitle>
          {{ mode === 'create' ? `Nuova attività #${nextNum}` : `Attività #${task?.num}` }}
        </DialogTitle>
        <DialogDescription>
          {{
            mode === 'create'
              ? 'Entra nella colonna TODO, in cima alla lista.'
              : 'Cambiando stato si sposta in cima alla colonna di destinazione.'
          }}
        </DialogDescription>
      </DialogHeader>

      <form class="space-y-4" @submit.prevent="submit">
        <div class="space-y-2">
          <Label for="task-client">Cliente</Label>
          <Select v-model="clientId" :disabled="submitting">
            <SelectTrigger id="task-client" class="w-full">
              <SelectValue placeholder="Seleziona un cliente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="c in clients" :key="c.id" :value="c.id">{{ c.name }}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div class="space-y-2">
          <Label for="task-title">Attività</Label>
          <Input
            id="task-title"
            v-model="title"
            type="text"
            placeholder="Analisi flusso ordini"
            :disabled="submitting"
            autocomplete="off"
          />
        </div>

        <div class="space-y-2">
          <Label for="task-description">Descrizione</Label>
          <Textarea id="task-description" v-model="description" rows="4" :disabled="submitting" />
        </div>

        <div v-if="mode === 'edit'" class="grid grid-cols-2 gap-4">
          <div class="space-y-2">
            <Label for="task-status">Stato</Label>
            <Select v-model="status" :disabled="submitting">
              <SelectTrigger id="task-status" class="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="s in statusOptions" :key="s" :value="s">
                  {{ statusLabels[s] }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div v-if="showHours" class="space-y-2">
            <Label for="task-hours">Ore</Label>
            <Input
              id="task-hours"
              v-model="hours"
              type="number"
              min="0.25"
              step="0.25"
              inputmode="decimal"
              placeholder="Opzionale"
              :disabled="submitting"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            v-if="canSendToStatino"
            type="button"
            variant="secondary"
            size="sm"
            class="sm:mr-auto"
            :disabled="submitting || statinoLoading"
            @click="openStatino"
          >
            {{ statinoLoading ? 'Apertura…' : 'A statino' }}
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

  <EntryFormDialog
    v-if="task"
    v-model:open="statinoOpen"
    mode="create"
    :entry="null"
    :date="statinoDate"
    :client-id="task.clientId"
    :contracts="statinoContracts"
    :projects="statinoProjects"
    :prefill="statinoPrefill"
    @saved="onStatinoSaved"
  />
</template>
