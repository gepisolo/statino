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
  invoices.value = [...invoices.value, i].sort((a, b) =>
    (b.date ?? b.dateFrom).localeCompare(a.date ?? a.dateFrom),
  );
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
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div class="min-w-0">
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
    <div v-else class="space-y-3 md:hidden">
      <div
        v-if="!invoices.length"
        class="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground"
      >
        Nessuna fattura.
      </div>
      <div
        v-for="i in invoices"
        :key="i.id"
        class="rounded-lg border bg-card p-4 text-card-foreground"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="font-medium">{{ i.number }}</div>
            <div class="truncate text-sm text-muted-foreground">
              {{ clientNames.get(i.clientId) ?? '—' }}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="ghost" size="icon" class="-mr-2 -mt-2" aria-label="Azioni">
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
        </div>
        <dl class="mt-3 space-y-1 text-sm">
          <div class="flex justify-between gap-4">
            <dt class="text-muted-foreground">Data</dt>
            <dd class="tabular-nums">{{ i.date ? formatDate(i.date) : '—' }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-muted-foreground">Periodo</dt>
            <dd class="tabular-nums">{{ formatDate(i.dateFrom) }} – {{ formatDate(i.dateTo) }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-muted-foreground">Ore</dt>
            <dd class="tabular-nums">{{ formatHours(i.hours) }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-muted-foreground">Importo</dt>
            <dd class="font-medium tabular-nums">{{ formatEur(i.amount) }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-muted-foreground">Incassato</dt>
            <dd class="text-right tabular-nums">
              <template v-if="i.payment">
                {{ formatEur(i.payment.amount) }}
                <span class="text-xs text-muted-foreground">
                  · {{ formatDate(i.payment.date) }}
                </span>
              </template>
              <template v-else>—</template>
            </dd>
          </div>
        </dl>
      </div>
    </div>
    <Table v-if="!loading" class="max-md:hidden">
      <TableHeader>
        <TableRow>
          <TableHead>Numero</TableHead>
          <TableHead>Data</TableHead>
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
          <TableCell colspan="8" class="text-center text-muted-foreground">
            Nessuna fattura.
          </TableCell>
        </TableRow>
        <TableRow v-for="i in invoices" :key="i.id">
          <TableCell class="font-medium">{{ i.number }}</TableCell>
          <TableCell class="tabular-nums">{{ i.date ? formatDate(i.date) : '—' }}</TableCell>
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
