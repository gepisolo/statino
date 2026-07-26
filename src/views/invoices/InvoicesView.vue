<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { toast } from 'vue-sonner';
import { Banknote, MoreHorizontal, Plus, Trash2 } from '@lucide/vue';
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
import InvoiceFormDialog from '@/components/invoices/InvoiceFormDialog.vue';
import InvoicePaymentFormDialog from '@/components/invoices/InvoicePaymentFormDialog.vue';
import { clientsRepo, contractsRepo, invoicesRepo, extractErrorMessage } from '@/lib/db';
import { formatDate, formatEur, formatHours } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';
import type { Client, Contract, Invoice } from '@/types/models';

const auth = useAuthStore();

const loading = ref(true);
const invoices = ref<Invoice[]>([]);
const clients = ref<Client[]>([]);
const contracts = ref<Contract[]>([]);

const formOpen = ref(false);

const paymentOpen = ref(false);
const paymentTarget = ref<Invoice | null>(null);

const deleteOpen = ref(false);
const deleteTarget = ref<Invoice | null>(null);
const deleteSubmitting = ref(false);

const clientNames = computed(() => new Map(clients.value.map((c) => [c.id, c.name])));

onMounted(async () => {
  try {
    [clients.value, contracts.value, invoices.value] = await Promise.all([
      clientsRepo.list(auth.uid!),
      contractsRepo.list(auth.uid!),
      invoicesRepo.list(auth.uid!),
    ]);
  } catch (err) {
    toast.error('Impossibile caricare le fatture', { description: extractErrorMessage(err) });
  } finally {
    loading.value = false;
  }
});

function onSaved(i: Invoice) {
  invoices.value = [...invoices.value, i].sort((a, b) => b.dateFrom.localeCompare(a.dateFrom));
}

function openPayment(i: Invoice) {
  paymentTarget.value = i;
  paymentOpen.value = true;
}

function onPaymentSaved(i: Invoice) {
  invoices.value = invoices.value.map((x) => (x.id === i.id ? i : x));
}

function askDelete(i: Invoice) {
  deleteTarget.value = i;
  deleteOpen.value = true;
}

async function confirmDelete() {
  if (!deleteTarget.value) return;
  deleteSubmitting.value = true;
  const i = deleteTarget.value;
  try {
    await invoicesRepo.removeWithEntries(auth.uid!, i.id);
    invoices.value = invoices.value.filter((x) => x.id !== i.id);
    toast.success('Fattura eliminata', { description: i.number });
    deleteOpen.value = false;
    deleteTarget.value = null;
  } catch (err) {
    toast.error('Impossibile eliminare la fattura', { description: extractErrorMessage(err) });
  } finally {
    deleteSubmitting.value = false;
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Fatture</h1>
        <p class="text-sm text-muted-foreground">
          Ogni fattura conteggia e blocca le attività del periodo: restano visibili nello statino ma
          non sono più modificabili (solo la descrizione) né eliminabili.
        </p>
      </div>
      <Button size="sm" :disabled="!clients.length" @click="formOpen = true">
        <Plus class="size-3.5" />
        Nuova fattura
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
          <TableHead>Numero</TableHead>
          <TableHead>Cliente</TableHead>
          <TableHead>Periodo</TableHead>
          <TableHead class="text-right">Ore</TableHead>
          <TableHead class="text-right">Importo</TableHead>
          <TableHead class="text-right">Incassato</TableHead>
          <TableHead class="w-12 text-right" />
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-if="!invoices.length">
          <TableCell colspan="7" class="text-center text-muted-foreground">
            Nessuna fattura.
          </TableCell>
        </TableRow>
        <TableRow v-for="i in invoices" :key="i.id">
          <TableCell class="font-medium">{{ i.number }}</TableCell>
          <TableCell>{{ clientNames.get(i.clientId) ?? '—' }}</TableCell>
          <TableCell class="tabular-nums">
            {{ formatDate(i.dateFrom) }} – {{ formatDate(i.dateTo) }}
          </TableCell>
          <TableCell class="text-right tabular-nums">{{ formatHours(i.hours) }}</TableCell>
          <TableCell class="text-right tabular-nums">{{ formatEur(i.amount) }}</TableCell>
          <TableCell class="text-right tabular-nums">
            <template v-if="i.payment">
              <div :title="i.payment.description || undefined">
                {{ formatEur(i.payment.amount) }}
              </div>
              <div class="text-xs text-muted-foreground">{{ formatDate(i.payment.date) }}</div>
            </template>
            <template v-else>—</template>
          </TableCell>
          <TableCell class="text-right">
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button variant="ghost" size="icon" aria-label="Azioni">
                  <MoreHorizontal class="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem @select="openPayment(i)">
                  <Banknote class="mr-2 size-4" />
                  {{ i.payment ? 'Modifica incasso…' : 'Registra incasso…' }}
                </DropdownMenuItem>
                <DropdownMenuItem
                  class="text-destructive focus:text-destructive"
                  @select="askDelete(i)"
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

    <InvoiceFormDialog
      v-model:open="formOpen"
      :clients="clients"
      :contracts="contracts"
      @saved="onSaved"
    />

    <InvoicePaymentFormDialog
      v-model:open="paymentOpen"
      :invoice="paymentTarget"
      @saved="onPaymentSaved"
    />

    <Dialog v-model:open="deleteOpen">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Eliminare la fattura?</DialogTitle>
          <DialogDescription>
            <span class="font-medium">{{ deleteTarget?.number }}</span> verrà rimossa e le attività
            che aveva bloccato torneranno modificabili nello statino.
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
