<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { toast } from 'vue-sonner';
import { FolderKanban, MoreHorizontal, Pencil, Plus, Trash2 } from '@lucide/vue';
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
import ClientFormDialog from '@/components/clients/ClientFormDialog.vue';
import { clientsRepo, extractErrorMessage } from '@/lib/db';
import { useAuthStore } from '@/stores/auth';
import type { Client } from '@/types/models';

const auth = useAuthStore();
const router = useRouter();

const loading = ref(true);
const clients = ref<Client[]>([]);

const formOpen = ref(false);
const formMode = ref<'create' | 'edit'>('create');
const formClient = ref<Client | null>(null);

const deleteOpen = ref(false);
const deleteTarget = ref<Client | null>(null);
const deleteSubmitting = ref(false);

onMounted(async () => {
  try {
    clients.value = await clientsRepo.list(auth.uid!);
  } catch (err) {
    toast.error('Impossibile caricare i clienti', { description: extractErrorMessage(err) });
  } finally {
    loading.value = false;
  }
});

function openCreate() {
  formMode.value = 'create';
  formClient.value = null;
  formOpen.value = true;
}

function openEdit(c: Client) {
  formMode.value = 'edit';
  formClient.value = c;
  formOpen.value = true;
}

function onSaved(c: Client) {
  const idx = clients.value.findIndex((x) => x.id === c.id);
  if (idx >= 0) {
    clients.value[idx] = c;
  } else {
    clients.value = [...clients.value, c];
  }
  clients.value = [...clients.value].sort((a, b) => a.name.localeCompare(b.name));
}

function askDelete(c: Client) {
  deleteTarget.value = c;
  deleteOpen.value = true;
}

async function confirmDelete() {
  if (!deleteTarget.value) return;
  deleteSubmitting.value = true;
  const c = deleteTarget.value;
  try {
    await clientsRepo.remove(auth.uid!, c.id);
    clients.value = clients.value.filter((x) => x.id !== c.id);
    toast.success('Cliente eliminato', { description: c.name });
    deleteOpen.value = false;
    deleteTarget.value = null;
  } catch (err) {
    toast.error('Impossibile eliminare il cliente', { description: extractErrorMessage(err) });
  } finally {
    deleteSubmitting.value = false;
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Clienti</h1>
        <p class="text-sm text-muted-foreground">Anagrafica dei clienti a cui fatturi le ore.</p>
      </div>
      <Button size="sm" @click="openCreate">
        <Plus class="size-3.5" />
        Nuovo cliente
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
          <TableHead class="w-12 text-right" />
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-if="!clients.length">
          <TableCell colspan="2" class="text-center text-muted-foreground">
            Nessun cliente. Crea il primo per poter aggiungere contratti.
          </TableCell>
        </TableRow>
        <TableRow v-for="c in clients" :key="c.id">
          <TableCell class="font-medium">{{ c.name }}</TableCell>
          <TableCell class="text-right">
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button variant="ghost" size="icon" aria-label="Azioni">
                  <MoreHorizontal class="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  @select="router.push({ name: 'client-projects', params: { clientId: c.id } })"
                >
                  <FolderKanban class="mr-2 size-4" />
                  Progetti
                </DropdownMenuItem>
                <DropdownMenuItem @select="openEdit(c)">
                  <Pencil class="mr-2 size-4" />
                  Modifica
                </DropdownMenuItem>
                <DropdownMenuItem
                  class="text-destructive focus:text-destructive"
                  @select="askDelete(c)"
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

    <ClientFormDialog
      v-model:open="formOpen"
      :mode="formMode"
      :client="formClient"
      @saved="onSaved"
    />

    <Dialog v-model:open="deleteOpen">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Eliminare il cliente?</DialogTitle>
          <DialogDescription>
            <span class="font-medium">{{ deleteTarget?.name }}</span> verrà rimosso dall'anagrafica.
            Contratti, progetti e ore già registrate che vi fanno riferimento non vengono cancellati
            ma resteranno orfani.
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
