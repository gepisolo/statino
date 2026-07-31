<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { toast } from 'vue-sonner';
import { Check } from '@lucide/vue';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { integrationsRepo, extractErrorMessage } from '@/lib/db';
import type { FicEntity } from '@/lib/fattureincloud';
import { useAuthStore } from '@/stores/auth';
import type { Client, FicConfig } from '@/types/models';

const props = defineProps<{
  open: boolean;
  config: FicConfig | null;
  client: Client | null;
  /** Anagrafiche FIC, caricate e tenute in cache dalla view. */
  entities: FicEntity[];
  loadingEntities: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void;
  (e: 'saved', c: FicConfig): void;
}>();

const auth = useAuthStore();

const filter = ref('');
const entityId = ref<number | null>(null);
const submitting = ref(false);

const filtered = computed(() => {
  const q = filter.value.trim().toLowerCase();
  if (!q) return props.entities;
  return props.entities.filter(
    (e) =>
      e.name.toLowerCase().includes(q) ||
      (e.vat_number ?? '').toLowerCase().includes(q) ||
      (e.tax_code ?? '').toLowerCase().includes(q),
  );
});

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    filter.value = '';
    entityId.value =
      props.config?.mappings.find((m) => m.clientId === props.client?.id)?.entityId ?? null;
  },
);

// Preseleziona l'anagrafica che si chiama come il cliente statino: nella
// pratica il nome coincide, e risparmia una ricerca a mano.
watch(
  () => props.entities,
  (list) => {
    if (entityId.value !== null || !props.client) return;
    const byName = list.find(
      (e) => e.name.trim().toLowerCase() === props.client!.name.trim().toLowerCase(),
    );
    if (byName) entityId.value = byName.id;
  },
);

async function submit() {
  const c = props.config;
  const client = props.client;
  const entity = props.entities.find((e) => e.id === entityId.value);
  if (!c || !client || !entity) return;
  submitting.value = true;
  try {
    const mappings = [
      ...c.mappings.filter((m) => m.clientId !== client.id),
      { clientId: client.id, entityId: entity.id, entityName: entity.name },
    ];
    // ⚠️ setDoc pieno: la config parte da quella corrente, cambia solo
    // l'elenco delle mappature.
    const saved = await integrationsRepo.saveFic(auth.uid!, { ...c, mappings });
    toast.success('Cliente collegato', { description: `${client.name} → ${entity.name}` });
    emit('saved', saved);
    emit('update:open', false);
  } catch (err) {
    toast.error('Impossibile salvare il collegamento', {
      description: extractErrorMessage(err),
    });
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
        <DialogTitle>Collega {{ client?.name }}</DialogTitle>
        <DialogDescription>
          Scegli l'anagrafica di Fatture in Cloud da usare come destinataria delle fatture di questo
          cliente.
        </DialogDescription>
      </DialogHeader>

      <div v-if="loadingEntities" class="space-y-2">
        <Skeleton class="h-9 w-full" />
        <Skeleton class="h-40 w-full" />
      </div>

      <form v-else class="space-y-4" @submit.prevent="submit">
        <div class="space-y-2">
          <Label for="fic-entity-filter">Cerca</Label>
          <Input
            id="fic-entity-filter"
            v-model="filter"
            type="search"
            placeholder="Nome, P.IVA o codice fiscale"
            :disabled="submitting"
            autocomplete="off"
          />
        </div>

        <div class="max-h-64 overflow-y-auto rounded-md border">
          <p v-if="!filtered.length" class="p-4 text-center text-sm text-muted-foreground">
            {{
              entities.length
                ? 'Nessuna anagrafica trovata.'
                : 'Nessuna anagrafica su Fatture in Cloud.'
            }}
          </p>
          <button
            v-for="e in filtered"
            :key="e.id"
            type="button"
            class="flex w-full items-center gap-2 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-accent"
            :class="entityId === e.id ? 'bg-accent' : ''"
            :disabled="submitting"
            @click="entityId = e.id"
          >
            <Check class="size-4 shrink-0" :class="entityId === e.id ? '' : 'invisible'" />
            <span class="min-w-0 flex-1">
              <span class="block truncate">{{ e.name }}</span>
              <span
                v-if="e.vat_number || e.tax_code"
                class="block truncate text-xs text-muted-foreground"
              >
                {{ e.vat_number || e.tax_code }}
              </span>
            </span>
          </button>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            :disabled="submitting"
            @click="handleOpenChange(false)"
          >
            Annulla
          </Button>
          <Button type="submit" size="sm" :disabled="submitting || entityId === null">
            {{ submitting ? 'Salvataggio…' : 'Collega' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
