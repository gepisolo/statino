<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { toast } from 'vue-sonner';
import { ArrowLeft, MoreHorizontal, Pencil, Plus, Trash2 } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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

const props = defineProps<{ clientId: string }>();

const auth = useAuthStore();

const loading = ref(true);
const client = ref<Client | null>(null);
const projects = ref<Project[]>([]);

const formOpen = ref(false);
const formMode = ref<'create' | 'edit'>('create');
const formProject = ref<Project | null>(null);

const deleteOpen = ref(false);
const deleteTarget = ref<Project | null>(null);
const deleteSubmitting = ref(false);

// id of the project whose switch is being saved, to disable it meanwhile
const togglingId = ref<string | null>(null);

const clientName = computed(() => client.value?.name ?? '—');

onMounted(async () => {
  try {
    const [clients, allProjects] = await Promise.all([
      clientsRepo.list(auth.uid!),
      projectsRepo.list(auth.uid!),
    ]);
    client.value = clients.find((c) => c.id === props.clientId) ?? null;
    projects.value = allProjects.filter((p) => p.clientId === props.clientId);
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

async function toggleActive(p: Project, active: boolean) {
  togglingId.value = p.id;
  try {
    const saved = await projectsRepo.update(auth.uid!, p.id, {
      clientId: p.clientId,
      name: p.name,
      active,
    });
    onSaved(saved);
  } catch (err) {
    toast.error('Impossibile aggiornare il progetto', { description: extractErrorMessage(err) });
  } finally {
    togglingId.value = null;
  }
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
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <RouterLink
          to="/clients"
          class="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft class="size-3.5" />
          Clienti
        </RouterLink>
        <h1 class="text-2xl font-semibold tracking-tight">Progetti · {{ clientName }}</h1>
        <p class="text-sm text-muted-foreground">
          I progetti di questo cliente, usati per suddividere le ore quando richiesto. Quelli non
          attivi non compaiono più tra le scelte di una nuova attività.
        </p>
      </div>
      <Button size="sm" @click="openCreate">
        <Plus class="size-3.5" />
        Nuovo progetto
      </Button>
    </div>

    <div v-if="loading" class="space-y-2">
      <Skeleton class="h-9 w-full" />
      <Skeleton class="h-9 w-full" />
      <Skeleton class="h-9 w-full" />
    </div>
    <Table v-else>
      <TableHeader>
        <TableRow>
          <TableHead>Nome</TableHead>
          <TableHead class="w-24">Attivo</TableHead>
          <TableHead class="w-12 text-right" />
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-if="!projects.length">
          <TableCell colspan="3" class="text-center text-muted-foreground">
            Nessun progetto per questo cliente.
          </TableCell>
        </TableRow>
        <TableRow v-for="p in projects" :key="p.id">
          <TableCell class="font-medium" :class="p.active === false ? 'text-muted-foreground' : ''">
            {{ p.name }}
          </TableCell>
          <TableCell>
            <Switch
              :model-value="p.active !== false"
              :disabled="togglingId === p.id"
              :aria-label="`Progetto ${p.name} attivo`"
              @update:model-value="toggleActive(p, $event)"
            />
          </TableCell>
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
      :client-id="clientId"
      @saved="onSaved"
    />

    <Dialog v-model:open="deleteOpen">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Eliminare il progetto?</DialogTitle>
          <DialogDescription>
            <span class="font-medium">{{ deleteTarget?.name }}</span> verrà rimosso. Le ore già
            registrate su questo progetto non vengono cancellate. Se vuoi solo nasconderlo dalle
            nuove attività, disattivalo invece di eliminarlo.
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
