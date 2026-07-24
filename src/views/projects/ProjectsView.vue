<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { toast } from 'vue-sonner';
import { MoreHorizontal, Pencil, Plus, Trash2 } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import ProjectFormDialog from '@/components/projects/ProjectFormDialog.vue';
import { clientsRepo, projectsRepo, extractErrorMessage } from '@/lib/db';
import { useAuthStore } from '@/stores/auth';
import type { Client, Project } from '@/types/models';

const auth = useAuthStore();

const loading = ref(true);
const projects = ref<Project[]>([]);
const clients = ref<Client[]>([]);

const clientFilter = ref('all');

const formOpen = ref(false);
const formMode = ref<'create' | 'edit'>('create');
const formProject = ref<Project | null>(null);

const deleteOpen = ref(false);
const deleteTarget = ref<Project | null>(null);
const deleteSubmitting = ref(false);

const clientNames = computed(() => new Map(clients.value.map((c) => [c.id, c.name])));

const filtered = computed(() =>
  clientFilter.value === 'all'
    ? projects.value
    : projects.value.filter((p) => p.clientId === clientFilter.value),
);

onMounted(async () => {
  try {
    [clients.value, projects.value] = await Promise.all([
      clientsRepo.list(auth.uid!),
      projectsRepo.list(auth.uid!),
    ]);
  } catch (err) {
    toast.error('Impossibile caricare i progetti', { description: extractErrorMessage(err) });
  } finally {
    loading.value = false;
  }
});

function openCreate() {
  formMode.value = 'create';
  formProject.value = null;
  formOpen.value = true;
}

function openEdit(p: Project) {
  formMode.value = 'edit';
  formProject.value = p;
  formOpen.value = true;
}

function onSaved(p: Project) {
  const idx = projects.value.findIndex((x) => x.id === p.id);
  if (idx >= 0) {
    projects.value[idx] = p;
  } else {
    projects.value = [...projects.value, p];
  }
  projects.value = [...projects.value].sort((a, b) => a.name.localeCompare(b.name));
}

function askDelete(p: Project) {
  deleteTarget.value = p;
  deleteOpen.value = true;
}

async function confirmDelete() {
  if (!deleteTarget.value) return;
  deleteSubmitting.value = true;
  const p = deleteTarget.value;
  try {
    await projectsRepo.remove(auth.uid!, p.id);
    projects.value = projects.value.filter((x) => x.id !== p.id);
    toast.success('Progetto eliminato', { description: p.name });
    deleteOpen.value = false;
    deleteTarget.value = null;
  } catch (err) {
    toast.error('Impossibile eliminare il progetto', { description: extractErrorMessage(err) });
  } finally {
    deleteSubmitting.value = false;
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Progetti</h1>
        <p class="text-sm text-muted-foreground">
          Progetti per cliente, usati per suddividere le ore quando richiesto.
        </p>
      </div>
      <Button size="sm" :disabled="!clients.length" @click="openCreate">
        <Plus class="size-3.5" />
        Nuovo progetto
      </Button>
    </div>

    <div class="flex items-center gap-2">
      <Select v-model="clientFilter">
        <SelectTrigger class="w-56">
          <SelectValue placeholder="Tutti i clienti" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tutti i clienti</SelectItem>
          <SelectItem v-for="c in clients" :key="c.id" :value="c.id">{{ c.name }}</SelectItem>
        </SelectContent>
      </Select>
    </div>

    <div v-if="loading" class="space-y-2">
      <Skeleton class="h-9 w-full" />
      <Skeleton class="h-9 w-full" />
      <Skeleton class="h-9 w-full" />
    </div>
    <Table v-else>
      <TableHeader>
        <TableRow>
          <TableHead>Cliente</TableHead>
          <TableHead>Nome</TableHead>
          <TableHead class="w-12 text-right" />
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-if="!filtered.length">
          <TableCell colspan="3" class="text-center text-muted-foreground">
            <template v-if="!clients.length">
              Prima crea un cliente, poi potrai aggiungere i suoi progetti.
            </template>
            <template v-else>Nessun progetto.</template>
          </TableCell>
        </TableRow>
        <TableRow v-for="p in filtered" :key="p.id">
          <TableCell class="font-medium">{{ clientNames.get(p.clientId) ?? '—' }}</TableCell>
          <TableCell>{{ p.name }}</TableCell>
          <TableCell class="text-right">
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button variant="ghost" size="icon" aria-label="Azioni">
                  <MoreHorizontal class="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem @select="openEdit(p)">
                  <Pencil class="mr-2 size-4" />
                  Modifica
                </DropdownMenuItem>
                <DropdownMenuItem
                  class="text-destructive focus:text-destructive"
                  @select="askDelete(p)"
                >
                  <Trash2 class="mr-2 size-4" />
                  Elimina…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>

    <ProjectFormDialog
      v-model:open="formOpen"
      :mode="formMode"
      :project="formProject"
      :clients="clients"
      @saved="onSaved"
    />

    <Dialog v-model:open="deleteOpen">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Eliminare il progetto?</DialogTitle>
          <DialogDescription>
            <span class="font-medium">{{ deleteTarget?.name }}</span> verrà rimosso. Le ore già
            registrate su questo progetto non vengono cancellate.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            :disabled="deleteSubmitting"
            @click="deleteOpen = false"
          >
            Annulla
          </Button>
          <Button
            variant="destructive"
            size="sm"
            :disabled="deleteSubmitting"
            @click="confirmDelete"
          >
            {{ deleteSubmitting ? 'Eliminazione…' : 'Elimina' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
