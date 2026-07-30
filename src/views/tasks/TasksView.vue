<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { toast } from 'vue-sonner';
import { Archive, CalendarCheck, Plus } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import TaskFormDialog from '@/components/tasks/TaskFormDialog.vue';
import { clientsRepo, tasksRepo, extractErrorMessage } from '@/lib/db';
import { todayIso } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';
import type { Client, Task, TaskStatus } from '@/types/models';

const auth = useAuthStore();

const loading = ref(true);
const tasks = ref<Task[]>([]);
const clients = ref<Client[]>([]);

const formOpen = ref(false);
const formMode = ref<'create' | 'edit'>('create');
const formTask = ref<Task | null>(null);

const clientNames = computed(() => new Map(clients.value.map((c) => [c.id, c.name])));

onMounted(load);

async function load() {
  loading.value = true;
  try {
    [clients.value, tasks.value] = await Promise.all([
      clientsRepo.list(auth.uid!),
      tasksRepo.list(auth.uid!),
    ]);
  } catch (err) {
    toast.error('Impossibile caricare le attività', { description: extractErrorMessage(err) });
  } finally {
    loading.value = false;
  }
}

// Board columns: the two done outcomes share one, archived has its own
// list under the second tab.
type Column = 'todo' | 'wip' | 'done';

function columnOf(t: Task): Column | 'archived' {
  if (t.archived) return 'archived';
  return t.status === 'done_ok' || t.status === 'done_ko' ? 'done' : t.status;
}

function colList(col: Column | 'archived'): Task[] {
  return tasks.value.filter((t) => columnOf(t) === col).sort((a, b) => a.order - b.order);
}

const todoTasks = computed(() => colList('todo'));
const wipTasks = computed(() => colList('wip'));
const doneTasks = computed(() => colList('done'));
const archivedTasks = computed(() => colList('archived'));

const columns = computed(() => [
  { key: 'todo' as Column, label: 'TODO', tasks: todoTasks.value },
  { key: 'wip' as Column, label: 'WIP', tasks: wipTasks.value },
  { key: 'done' as Column, label: 'Done', tasks: doneTasks.value },
]);

function openCreate() {
  formMode.value = 'create';
  formTask.value = null;
  formOpen.value = true;
}

function openEdit(t: Task) {
  formMode.value = 'edit';
  formTask.value = t;
  formOpen.value = true;
}

function onSaved(t: Task) {
  const idx = tasks.value.findIndex((x) => x.id === t.id);
  if (idx >= 0) {
    tasks.value = tasks.value.map((x) => (x.id === t.id ? t : x));
  } else {
    tasks.value = [...tasks.value, t];
  }
}

// --- Drag & drop (HTML5, desktop; on touch the dialog's status select
// covers the same moves) ---

const draggingId = ref<string | null>(null);
const dropHint = ref<{ id: string; before: boolean } | null>(null);
const hoverColumn = ref<Column | null>(null);

function onDragStart(e: DragEvent, t: Task) {
  draggingId.value = t.id;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', t.id);
  }
}

function onDragEnd() {
  draggingId.value = null;
  dropHint.value = null;
  hoverColumn.value = null;
}

function onCardDragOver(e: DragEvent, t: Task, col: Column) {
  if (!draggingId.value || draggingId.value === t.id) return;
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  dropHint.value = { id: t.id, before: e.clientY < rect.top + rect.height / 2 };
  hoverColumn.value = col;
}

function onColumnDragOver(col: Column) {
  if (draggingId.value) hoverColumn.value = col;
}

async function onDrop(col: Column, target?: Task) {
  const id = draggingId.value;
  const hint = dropHint.value;
  onDragEnd();
  if (!id) return;
  const task = tasks.value.find((t) => t.id === id);
  if (!task || task.archived) return;

  const list = colList(col).filter((t) => t.id !== id);
  let idx = list.length;
  if (target && target.id !== id) {
    const ti = list.findIndex((t) => t.id === target.id);
    if (ti >= 0) idx = ti + (hint?.id === target.id && !hint.before ? 1 : 0);
  }
  // Dropping into Done defaults to OK; moving within Done keeps the
  // outcome (it's just a reorder).
  const sameColumn = columnOf(task) === col;
  const newStatus: TaskStatus = col === 'done' ? (sameColumn ? task.status : 'done_ok') : col;
  // Entering Done stamps today, leaving it clears the stamp.
  const doneAt = col === 'done' ? (sameColumn ? (task.doneAt ?? null) : todayIso()) : null;

  const ordered = [...list.slice(0, idx), task, ...list.slice(idx)];
  const updates = ordered.map((t, i) => ({
    id: t.id,
    order: i,
    ...(t.id === id && newStatus !== task.status ? { status: newStatus, doneAt } : {}),
  }));

  const orderById = new Map(updates.map((u) => [u.id, u.order]));
  tasks.value = tasks.value.map((t) => {
    const order = orderById.get(t.id);
    if (order === undefined) return t;
    if (t.id !== id) return { ...t, order };
    return newStatus !== task.status ? { ...t, order, status: newStatus, doneAt } : { ...t, order };
  });
  try {
    await tasksRepo.reorder(auth.uid!, updates);
  } catch (err) {
    toast.error("Impossibile spostare l'attività", { description: extractErrorMessage(err) });
    await load();
  }
}

// --- Archiving straight from a Done card: no dialog, no confirm (the
// Archivio tab keeps it, and the dialog can send it back). Offered only
// on Done cards, like the dialog's "Archiviata" option — archiving a
// TODO/WIP task would have to invent a done outcome for it. ---

const archivingId = ref<string | null>(null);

function canArchive(t: Task): boolean {
  return !t.archived && columnOf(t) === 'done';
}

async function archive(t: Task) {
  if (archivingId.value) return;
  archivingId.value = t.id;
  // The archived list is ordered like a column: entering it lands on top.
  const orders = archivedTasks.value.map((x) => x.order);
  const order = orders.length ? Math.min(...orders) - 1 : 0;
  const previous = tasks.value;
  tasks.value = tasks.value.map((x) => (x.id === t.id ? { ...x, archived: true, order } : x));
  try {
    await tasksRepo.archive(auth.uid!, t.id, order);
    toast.success('Attività archiviata', { description: `#${t.num} · ${t.title}` });
  } catch (err) {
    tasks.value = previous;
    toast.error("Impossibile archiviare l'attività", { description: extractErrorMessage(err) });
  } finally {
    archivingId.value = null;
  }
}

function cardClass(t: Task): string {
  const classes: string[] = [];
  if (t.status === 'done_ok' && (columnOf(t) === 'done' || t.archived)) {
    classes.push('bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-900');
  } else if (t.status === 'done_ko' && (columnOf(t) === 'done' || t.archived)) {
    classes.push('bg-rose-50 border-rose-200 dark:bg-rose-950/40 dark:border-rose-900');
  } else {
    classes.push('bg-card');
  }
  if (draggingId.value === t.id) classes.push('opacity-50');
  if (dropHint.value?.id === t.id) {
    classes.push(
      dropHint.value.before ? 'border-t-2 border-t-primary' : 'border-b-2 border-b-primary',
    );
  }
  return classes.join(' ');
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div class="min-w-0">
        <h1 class="text-2xl font-semibold tracking-tight">Attività</h1>
        <p class="text-sm text-muted-foreground">
          Lavagna delle attività per cliente: trascina le righe tra le colonne o cambia stato dal
          dettaglio.
        </p>
      </div>
    </div>

    <div v-if="loading" class="space-y-2">
      <Skeleton class="h-9 w-full" />
      <Skeleton class="h-40 w-full" />
    </div>

    <Tabs v-else default-value="active">
      <TabsList>
        <TabsTrigger value="active">Attive</TabsTrigger>
        <TabsTrigger value="old">Archivio</TabsTrigger>
      </TabsList>

      <TabsContent value="active">
        <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div
            v-for="col in columns"
            :key="col.key"
            class="flex min-h-48 flex-col rounded-lg border bg-muted/30"
            :class="hoverColumn === col.key && draggingId ? 'ring-2 ring-primary/40' : ''"
            @dragover.prevent="onColumnDragOver(col.key)"
            @drop.prevent="onDrop(col.key)"
          >
            <div class="flex items-center justify-between gap-2 px-3 pt-2.5 pb-1">
              <span class="text-sm font-semibold">
                {{ col.label }}
                <span class="ml-1 font-normal text-muted-foreground">{{ col.tasks.length }}</span>
              </span>
              <Button
                v-if="col.key === 'todo'"
                variant="ghost"
                size="icon"
                class="-my-1 size-7"
                aria-label="Nuova attività"
                :disabled="!clients.length"
                @click="openCreate"
              >
                <Plus class="size-4" />
              </Button>
            </div>
            <div class="flex-1 space-y-2 p-2">
              <p
                v-if="!col.tasks.length"
                class="px-1 py-2 text-center text-xs text-muted-foreground"
              >
                Nessuna attività.
              </p>
              <div
                v-for="t in col.tasks"
                :key="t.id"
                draggable="true"
                class="cursor-grab rounded-md border p-2.5 shadow-xs select-none"
                :class="cardClass(t)"
                @click="openEdit(t)"
                @dragstart="onDragStart($event, t)"
                @dragend="onDragEnd"
                @dragover.prevent.stop="onCardDragOver($event, t, col.key)"
                @drop.prevent.stop="onDrop(col.key, t)"
              >
                <div class="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span class="truncate">{{ clientNames.get(t.clientId) ?? '—' }}</span>
                  <div class="flex shrink-0 items-center gap-1.5">
                    <CalendarCheck
                      v-if="t.statinoEntryId"
                      class="size-3.5"
                      aria-label="Riportata a statino"
                    />
                    <button
                      v-if="canArchive(t)"
                      type="button"
                      draggable="false"
                      class="cursor-pointer rounded-sm p-0.5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50 pointer-coarse:p-1"
                      :disabled="archivingId === t.id"
                      title="Archivia"
                      aria-label="Archivia attività"
                      @click.stop="archive(t)"
                    >
                      <Archive class="size-3.5" />
                    </button>
                  </div>
                </div>
                <div class="text-sm font-medium">{{ t.title }}</div>
              </div>
            </div>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="old">
        <div class="space-y-2">
          <p
            v-if="!archivedTasks.length"
            class="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground"
          >
            Nessuna attività archiviata.
          </p>
          <div
            v-for="t in archivedTasks"
            :key="t.id"
            class="cursor-pointer rounded-md border p-2.5 shadow-xs"
            :class="cardClass(t)"
            @click="openEdit(t)"
          >
            <div class="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span class="truncate">{{ clientNames.get(t.clientId) ?? '—' }}</span>
              <CalendarCheck
                v-if="t.statinoEntryId"
                class="size-3.5 shrink-0"
                aria-label="Riportata a statino"
              />
            </div>
            <div class="text-sm font-medium">{{ t.title }}</div>
          </div>
        </div>
      </TabsContent>
    </Tabs>

    <TaskFormDialog
      v-model:open="formOpen"
      :mode="formMode"
      :task="formTask"
      :clients="clients"
      :tasks="tasks"
      @saved="onSaved"
    />
  </div>
</template>
