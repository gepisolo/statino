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
import ContractFormDialog from '@/components/contracts/ContractFormDialog.vue';
import { clientsRepo, contractsRepo, extractErrorMessage } from '@/lib/db';
import { formatDate, formatEur, formatHours, todayIso } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';
import type { Client, Contract } from '@/types/models';

const auth = useAuthStore();

const loading = ref(true);
const contracts = ref<Contract[]>([]);
const clients = ref<Client[]>([]);

const clientFilter = ref('all');

const formOpen = ref(false);
const formMode = ref<'create' | 'edit'>('create');
const formContract = ref<Contract | null>(null);

const deleteOpen = ref(false);
const deleteTarget = ref<Contract | null>(null);
const deleteSubmitting = ref(false);

const clientNames = computed(() => new Map(clients.value.map((c) => [c.id, c.name])));

const filtered = computed(() =>
  clientFilter.value === 'all'
    ? contracts.value
    : contracts.value.filter((c) => c.clientId === clientFilter.value),
);

type ContractState = 'attivo' | 'futuro' | 'scaduto';

function stateOf(c: Contract): ContractState {
  const today = todayIso();
  if (today < c.startDate) return 'futuro';
  if (today > c.endDate) return 'scaduto';
  return 'attivo';
}

const stateClasses: Record<ContractState, string> = {
  attivo: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
  futuro: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-400',
  scaduto: 'bg-muted text-muted-foreground',
};

onMounted(async () => {
  try {
    [clients.value, contracts.value] = await Promise.all([
      clientsRepo.list(auth.uid!),
      contractsRepo.list(auth.uid!),
    ]);
  } catch (err) {
    toast.error('Impossibile caricare i contratti', { description: extractErrorMessage(err) });
  } finally {
    loading.value = false;
  }
});

function openCreate() {
  formMode.value = 'create';
  formContract.value = null;
  formOpen.value = true;
}

function openEdit(c: Contract) {
  formMode.value = 'edit';
  formContract.value = c;
  formOpen.value = true;
}

function onSaved(c: Contract) {
  const idx = contracts.value.findIndex((x) => x.id === c.id);
  if (idx >= 0) {
    contracts.value[idx] = c;
  } else {
    contracts.value = [...contracts.value, c];
  }
  contracts.value = [...contracts.value].sort((a, b) => b.startDate.localeCompare(a.startDate));
}

function askDelete(c: Contract) {
  deleteTarget.value = c;
  deleteOpen.value = true;
}

async function confirmDelete() {
  if (!deleteTarget.value) return;
  deleteSubmitting.value = true;
  const c = deleteTarget.value;
  try {
    await contractsRepo.remove(auth.uid!, c.id);
    contracts.value = contracts.value.filter((x) => x.id !== c.id);
    toast.success('Contratto eliminato', { description: c.activity });
    deleteOpen.value = false;
    deleteTarget.value = null;
  } catch (err) {
    toast.error('Impossibile eliminare il contratto', { description: extractErrorMessage(err) });
  } finally {
    deleteSubmitting.value = false;
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Contratti</h1>
        <p class="text-sm text-muted-foreground">
          Monte ore annuali e tariffe per cliente e attività.
        </p>
      </div>
      <Button size="sm" :disabled="!clients.length" @click="openCreate">
        <Plus class="size-3.5" />
        Nuovo contratto
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
          <TableHead>Attività</TableHead>
          <TableHead>Validità</TableHead>
          <TableHead class="text-right">Monte ore</TableHead>
          <TableHead class="text-right">Costo orario</TableHead>
          <TableHead>Stato</TableHead>
          <TableHead class="w-12 text-right" />
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-if="!filtered.length">
          <TableCell colspan="7" class="text-center text-muted-foreground">
            <template v-if="!clients.length">
              Prima crea un cliente, poi potrai aggiungere i suoi contratti.
            </template>
            <template v-else>Nessun contratto.</template>
          </TableCell>
        </TableRow>
        <TableRow v-for="c in filtered" :key="c.id">
          <TableCell class="font-medium">
            {{ clientNames.get(c.clientId) ?? '—' }}
          </TableCell>
          <TableCell>{{ c.activity }}</TableCell>
          <TableCell class="whitespace-nowrap text-sm">
            {{ formatDate(c.startDate) }} – {{ formatDate(c.endDate) }}
          </TableCell>
          <TableCell class="text-right">{{ formatHours(c.annualHours) }} h</TableCell>
          <TableCell class="text-right">{{ formatEur(c.hourlyRate) }}</TableCell>
          <TableCell>
            <span
              class="rounded-full px-2 py-0.5 text-xs font-medium"
              :class="stateClasses[stateOf(c)]"
            >
              {{ stateOf(c) }}
            </span>
          </TableCell>
          <TableCell class="text-right">
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button variant="ghost" size="icon" aria-label="Azioni">
                  <MoreHorizontal class="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
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

    <ContractFormDialog
      v-model:open="formOpen"
      :mode="formMode"
      :contract="formContract"
      :clients="clients"
      @saved="onSaved"
    />

    <Dialog v-model:open="deleteOpen">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Eliminare il contratto?</DialogTitle>
          <DialogDescription>
            Il contratto <span class="font-medium">{{ deleteTarget?.activity }}</span> di
            <span class="font-medium">
              {{ deleteTarget ? (clientNames.get(deleteTarget.clientId) ?? '—') : '' }}
            </span>
            verrà rimosso. Le ore già registrate su questo contratto non vengono cancellate.
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
