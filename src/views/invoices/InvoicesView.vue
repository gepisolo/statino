<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { toast } from 'vue-sonner';
import { parseDate, type DateValue } from '@internationalized/date';
import { DatePickerRoot, DatePickerTrigger } from 'reka-ui';
import { Pencil, Plus } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { DatePickerPanel } from '@/components/ui/date-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import InvoiceFormDialog from '@/components/invoices/InvoiceFormDialog.vue';
import InvoicePaymentFormDialog from '@/components/invoices/InvoicePaymentFormDialog.vue';
import InvoiceFicDialog from '@/components/invoices/InvoiceFicDialog.vue';
import InvoiceActionsMenu from '@/components/invoices/InvoiceActionsMenu.vue';
import {
  clientsRepo,
  contractsRepo,
  integrationsRepo,
  invoicesRepo,
  extractErrorMessage,
} from '@/lib/db';
import { formatDate, formatEur, formatHours } from '@/lib/format';
import { invoiceRefDate } from '@/lib/stats';
import { useAuthStore } from '@/stores/auth';
import type { Client, Contract, Integration, Invoice } from '@/types/models';

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

const ficIntegrations = ref<Integration[]>([]);
const ficOpen = ref(false);
const ficTarget = ref<Invoice | null>(null);
const unlinkOpen = ref(false);
const unlinkTarget = ref<Invoice | null>(null);
// Solo i connettori di fatturazione davvero collegati: uno creato ma senza
// azienda non può emettere niente.
const ficConnectors = computed(() =>
  ficIntegrations.value.filter((i) => i.type === 'fatturazione' && i.config.companyId),
);
const ficEnabled = computed(() => ficConnectors.value.length > 0);

const clientNames = computed(() => new Map(clients.value.map((c) => [c.id, c.name])));

// Filter on the issue date's year (docs without one fall back to the
// period end, same reference the stats use).
const year = ref(new Date().getFullYear());
const yearOf = (i: Invoice) => Number(invoiceRefDate(i).slice(0, 4));
const yearOptions = computed(() => {
  const years = new Set(invoices.value.map(yearOf));
  years.add(new Date().getFullYear());
  return [...years].sort((a, b) => b - a);
});
const filteredInvoices = computed(() => invoices.value.filter((i) => yearOf(i) === year.value));

onMounted(async () => {
  try {
    [clients.value, contracts.value, invoices.value, ficIntegrations.value] = await Promise.all([
      clientsRepo.list(auth.uid!),
      contractsRepo.list(auth.uid!),
      invoicesRepo.list(auth.uid!),
      integrationsRepo.list(auth.uid!),
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
  // Keep the new invoice visible even if it lands in another year.
  year.value = yearOf(i);
}

// Backfill for invoices created before the issue-date field existed.
async function setInvoiceDate(i: Invoice, v: DateValue | undefined) {
  if (!v) return;
  const date = v.toString();
  try {
    await invoicesRepo.setDate(auth.uid!, i.id, date);
    invoices.value = invoices.value
      .map((x) => (x.id === i.id ? { ...x, date } : x))
      .sort((a, b) => (b.date ?? b.dateFrom).localeCompare(a.date ?? a.dateFrom));
    toast.success('Data fattura impostata', { description: `${i.number} · ${formatDate(date)}` });
  } catch (err) {
    toast.error('Impossibile impostare la data', { description: extractErrorMessage(err) });
  }
}

function openPayment(i: Invoice) {
  paymentTarget.value = i;
  paymentOpen.value = true;
}

function onPaymentSaved(i: Invoice) {
  invoices.value = invoices.value.map((x) => (x.id === i.id ? i : x));
}

function openFic(i: Invoice) {
  ficTarget.value = i;
  ficOpen.value = true;
}

function onFicCreated(i: Invoice) {
  invoices.value = invoices.value.map((x) => (x.id === i.id ? i : x));
}

function askUnlink(i: Invoice) {
  unlinkTarget.value = i;
  unlinkOpen.value = true;
}

async function confirmUnlink() {
  const i = unlinkTarget.value;
  if (!i) return;
  deleteSubmitting.value = true;
  try {
    await invoicesRepo.setExternal(auth.uid!, i.id, null);
    invoices.value = invoices.value.map((x) => (x.id === i.id ? { ...x, external: null } : x));
    toast.success('Fattura scollegata', {
      description: 'Il documento su Fatture in Cloud resta dov’è.',
    });
    unlinkOpen.value = false;
    unlinkTarget.value = null;
  } catch (err) {
    toast.error('Impossibile scollegare', { description: extractErrorMessage(err) });
  } finally {
    deleteSubmitting.value = false;
  }
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
      <div class="flex items-center gap-2">
        <Select v-model="year">
          <SelectTrigger class="w-24" aria-label="Anno">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="y in yearOptions" :key="y" :value="y">{{ y }}</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" :disabled="!clients.length" @click="formOpen = true">
          <Plus class="size-3.5" />
          Nuova fattura
        </Button>
      </div>
    </div>

    <div v-if="loading" class="space-y-2">
      <Skeleton class="h-9 w-full" />
      <Skeleton class="h-9 w-full" />
      <Skeleton class="h-9 w-full" />
    </div>
    <div v-else class="space-y-3 md:hidden">
      <div
        v-if="!filteredInvoices.length"
        class="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground"
      >
        {{ invoices.length ? `Nessuna fattura nel ${year}.` : 'Nessuna fattura.' }}
      </div>
      <div
        v-for="i in filteredInvoices"
        :key="i.id"
        class="rounded-lg border bg-card p-4 text-card-foreground"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="font-medium">{{ i.number }}</div>
            <div v-if="i.external" class="text-xs text-muted-foreground">
              FIC n. {{ i.external.number }}
            </div>
            <div class="truncate text-sm text-muted-foreground">
              {{ clientNames.get(i.clientId) ?? '—' }}
            </div>
          </div>
          <InvoiceActionsMenu
            :invoice="i"
            :fic-enabled="ficEnabled"
            trigger-class="-mr-2 -mt-2"
            @payment="openPayment(i)"
            @fic="openFic(i)"
            @unlink-fic="askUnlink(i)"
            @delete="askDelete(i)"
          />
        </div>
        <dl class="mt-3 space-y-1 text-sm">
          <div class="flex justify-between gap-4">
            <dt class="text-muted-foreground">Data</dt>
            <dd class="tabular-nums">
              <template v-if="i.date">{{ formatDate(i.date) }}</template>
              <DatePickerRoot
                v-else
                locale="it"
                :week-starts-on="1"
                weekday-format="short"
                :default-placeholder="parseDate(i.dateTo)"
                @update:model-value="(v) => setInvoiceDate(i, v)"
              >
                <DatePickerTrigger
                  class="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 -my-1 inline-flex size-7 items-center justify-center rounded-md outline-none focus-visible:ring-3"
                  aria-label="Imposta data fattura"
                  title="Imposta data fattura"
                >
                  <Pencil class="size-3.5" />
                </DatePickerTrigger>
                <DatePickerPanel align="end" />
              </DatePickerRoot>
            </dd>
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
            <dd class="text-right font-medium tabular-nums">
              {{ formatEur(i.amount) }}
              <div v-if="i.discount" class="text-xs font-normal text-muted-foreground">
                sconto −{{ formatEur(i.discount.amount) }} · {{ i.discount.reason }}
              </div>
            </dd>
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
        <TableRow v-if="!filteredInvoices.length">
          <TableCell colspan="8" class="text-center text-muted-foreground">
            {{ invoices.length ? `Nessuna fattura nel ${year}.` : 'Nessuna fattura.' }}
          </TableCell>
        </TableRow>
        <TableRow v-for="i in filteredInvoices" :key="i.id">
          <TableCell class="font-medium">
            <div>{{ i.number }}</div>
            <div v-if="i.external" class="text-xs font-normal text-muted-foreground">
              FIC n. {{ i.external.number }}
            </div>
          </TableCell>
          <TableCell class="tabular-nums">
            <template v-if="i.date">{{ formatDate(i.date) }}</template>
            <DatePickerRoot
              v-else
              locale="it"
              :week-starts-on="1"
              weekday-format="short"
              :default-placeholder="parseDate(i.dateTo)"
              @update:model-value="(v) => setInvoiceDate(i, v)"
            >
              <DatePickerTrigger
                class="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 -my-1 inline-flex size-7 items-center justify-center rounded-md outline-none focus-visible:ring-3"
                aria-label="Imposta data fattura"
                title="Imposta data fattura"
              >
                <Pencil class="size-3.5" />
              </DatePickerTrigger>
              <DatePickerPanel align="start" />
            </DatePickerRoot>
          </TableCell>
          <TableCell>{{ clientNames.get(i.clientId) ?? '—' }}</TableCell>
          <TableCell class="tabular-nums">
            {{ formatDate(i.dateFrom) }} – {{ formatDate(i.dateTo) }}
          </TableCell>
          <TableCell class="text-right tabular-nums">{{ formatHours(i.hours) }}</TableCell>
          <TableCell class="text-right tabular-nums">
            <div>{{ formatEur(i.amount) }}</div>
            <div v-if="i.discount" class="text-xs text-muted-foreground" :title="i.discount.reason">
              sconto −{{ formatEur(i.discount.amount) }}
            </div>
          </TableCell>
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
            <InvoiceActionsMenu
              :invoice="i"
              :fic-enabled="ficEnabled"
              @payment="openPayment(i)"
              @fic="openFic(i)"
              @unlink-fic="askUnlink(i)"
              @delete="askDelete(i)"
            />
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

    <InvoiceFicDialog
      v-model:open="ficOpen"
      :invoice="ficTarget"
      :clients="clients"
      :contracts="contracts"
      :integrations="ficConnectors"
      @created="onFicCreated"
    />

    <Dialog v-model:open="unlinkOpen">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Scollegare da Fatture in Cloud?</DialogTitle>
          <DialogDescription>
            Statino dimentica il documento n.
            <span class="font-medium">{{ unlinkTarget?.external?.number }}</span> e la fattura torna
            creabile. Il documento su Fatture in Cloud non viene toccato: se è sbagliato, eliminalo
            da lì, altrimenti finiresti con due fatture.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            :disabled="deleteSubmitting"
            @click="unlinkOpen = false"
          >
            Annulla
          </Button>
          <Button size="sm" :disabled="deleteSubmitting" @click="confirmUnlink">
            {{ deleteSubmitting ? 'Scollegamento…' : 'Scollega' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="deleteOpen">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Eliminare la fattura?</DialogTitle>
          <DialogDescription>
            <span class="font-medium">{{ deleteTarget?.number }}</span> verrà rimossa e le attività
            che aveva bloccato torneranno modificabili nello statino.
            <template v-if="deleteTarget?.external">
              Il documento n.
              <span class="font-medium">{{ deleteTarget.external.number }}</span> su Fatture in
              Cloud <span class="font-medium">non</span> verrà eliminato.
            </template>
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
