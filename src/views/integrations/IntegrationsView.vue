<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
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
import IntegrationCreateDialog from '@/components/integrations/IntegrationCreateDialog.vue';
import { integrationsRepo, extractErrorMessage } from '@/lib/db';
import { PROVIDER_LABELS, TYPE_LABELS } from '@/lib/integrations';
import { useAuthStore } from '@/stores/auth';
import type { Integration } from '@/types/models';

const auth = useAuthStore();
const router = useRouter();

const loading = ref(true);
const integrations = ref<Integration[]>([]);

const createOpen = ref(false);
const deleteOpen = ref(false);
const deleteTarget = ref<Integration | null>(null);
const deleteSubmitting = ref(false);

onMounted(async () => {
  try {
    integrations.value = await integrationsRepo.list(auth.uid!);
  } catch (err) {
    toast.error('Impossibile caricare le integrazioni', {
      description: extractErrorMessage(err),
    });
  } finally {
    loading.value = false;
  }
});

// Un connettore appena creato non è ancora collegato: si va dritti al suo
// dettaglio, che è dove si incolla il token.
function onCreated(i: Integration) {
  integrations.value = [...integrations.value, i].sort((a, b) => a.title.localeCompare(b.title));
  router.push(`/integrations/${i.id}`);
}

async function confirmDelete() {
  const i = deleteTarget.value;
  if (!i) return;
  deleteSubmitting.value = true;
  try {
    await integrationsRepo.removeWithToken(auth.uid!, i.id);
    integrations.value = integrations.value.filter((x) => x.id !== i.id);
    toast.success('Integrazione eliminata', {
      description: 'Revoca anche il token dal gestionale, se non ti serve più.',
    });
    deleteOpen.value = false;
    deleteTarget.value = null;
  } catch (err) {
    toast.error('Impossibile eliminare', { description: extractErrorMessage(err) });
  } finally {
    deleteSubmitting.value = false;
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div class="min-w-0">
        <h1 class="text-2xl font-semibold tracking-tight">Integrazioni</h1>
        <p class="text-sm text-muted-foreground">
          Connettori verso gestionali esterni. Puoi averne più d'uno dello stesso tipo: quando crei
          una fattura scegli con quale farla.
        </p>
      </div>
      <Button size="sm" @click="createOpen = true">
        <Plus class="size-3.5" />
        Nuova integrazione
      </Button>
    </div>

    <div v-if="loading" class="space-y-2">
      <Skeleton class="h-9 w-full" />
      <Skeleton class="h-9 w-full" />
    </div>

    <Table v-else>
      <TableHeader>
        <TableRow>
          <TableHead>Tipo</TableHead>
          <TableHead>Nome</TableHead>
          <TableHead>Titolo</TableHead>
          <TableHead>Stato</TableHead>
          <TableHead class="w-12 text-right" />
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-if="!integrations.length">
          <TableCell colspan="5" class="text-center text-muted-foreground">
            Nessuna integrazione configurata.
          </TableCell>
        </TableRow>
        <TableRow v-for="i in integrations" :key="i.id">
          <TableCell>{{ TYPE_LABELS[i.type] }}</TableCell>
          <TableCell>{{ PROVIDER_LABELS[i.provider] }}</TableCell>
          <TableCell class="font-medium">{{ i.title }}</TableCell>
          <TableCell>
            <template v-if="i.config.companyId">{{ i.config.companyName }}</template>
            <span v-else class="text-muted-foreground">Non collegata</span>
          </TableCell>
          <TableCell class="text-right">
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button variant="ghost" size="icon" aria-label="Azioni">
                  <MoreHorizontal class="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem @select="router.push(`/integrations/${i.id}`)">
                  <Pencil class="mr-2 size-4" />
                  Configura
                </DropdownMenuItem>
                <DropdownMenuItem
                  class="text-destructive focus:text-destructive"
                  @select="
                    deleteTarget = i;
                    deleteOpen = true;
                  "
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

    <IntegrationCreateDialog v-model:open="createOpen" @created="onCreated" />

    <Dialog v-model:open="deleteOpen">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Eliminare l'integrazione?</DialogTitle>
          <DialogDescription>
            <span class="font-medium">{{ deleteTarget?.title }}</span> verrà rimossa insieme al suo
            token, ai parametri e alle mappature dei clienti. I documenti già creati sul gestionale
            restano dove sono, ma le fatture che li riportano perderanno il riferimento al
            connettore.
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
