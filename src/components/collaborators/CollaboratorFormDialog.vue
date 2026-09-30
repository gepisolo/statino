<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { toast } from 'vue-sonner';
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
import { Switch } from '@/components/ui/switch';
import {
  clientsRepo,
  collaboratorsRepo,
  contractsRepo,
  projectsRepo,
  extractErrorMessage,
} from '@/lib/db';
import { buildCollaboratorClients } from '@/lib/collaborators';
import { formatDate, todayIso } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';
import type { Client, Collaborator, Contract, Project } from '@/types/models';

const props = defineProps<{
  open: boolean;
  mode: 'create' | 'edit';
  collaborator: Collaborator | null;
  // Email già in uso (admin, utenti abilitati, altri collaboratori): un
  // account ha un solo ruolo.
  takenEmails: string[];
}>();

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void;
  (e: 'saved', c: Collaborator): void;
}>();

const auth = useAuthStore();

const email = ref('');
const name = ref('');
const active = ref(true);
// Permessi: cliente spuntato = chiave presente, con i suoi contratti.
const grants = ref<Record<string, string[]>>({});
const submitting = ref(false);

const loading = ref(false);
const clients = ref<Client[]>([]);
const contracts = ref<Contract[]>([]);
const projects = ref<Project[]>([]);

const normalizedEmail = computed(() => email.value.trim().toLowerCase());
const emailError = computed(() => {
  if (props.mode === 'edit' || normalizedEmail.value === '') return '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail.value))
    return 'Indirizzo email non valido';
  if (props.takenEmails.includes(normalizedEmail.value)) return 'Questo account è già abilitato';
  return '';
});
const valid = computed(
  () =>
    !loading.value &&
    name.value.trim().length > 0 &&
    (props.mode === 'edit' || (normalizedEmail.value !== '' && emailError.value === '')),
);

function contractsOf(clientId: string): Contract[] {
  return contracts.value.filter((c) => c.clientId === clientId);
}

function contractState(c: Contract): string {
  const today = todayIso();
  if (c.endDate < today) return 'scaduto';
  if (c.startDate > today) return 'futuro';
  return 'attivo';
}

function toggleClient(clientId: string, checked: boolean) {
  const next = { ...grants.value };
  if (checked) {
    // Parte con i contratti in corso già spuntati: è il caso normale, e
    // quelli scaduti o futuri restano una scelta esplicita.
    next[clientId] = contractsOf(clientId)
      .filter((c) => contractState(c) === 'attivo')
      .map((c) => c.id);
  } else {
    delete next[clientId];
  }
  grants.value = next;
}

function toggleContract(clientId: string, contractId: string, checked: boolean) {
  const current = grants.value[clientId] ?? [];
  grants.value = {
    ...grants.value,
    [clientId]: checked ? [...current, contractId] : current.filter((id) => id !== contractId),
  };
}

watch(
  () => props.open,
  async (open) => {
    if (!open) return;
    const c = props.collaborator;
    email.value = c?.email ?? '';
    name.value = c?.name ?? '';
    active.value = c?.active ?? true;
    grants.value = Object.fromEntries(
      (c?.clients ?? []).map((cl) => [cl.id, cl.contracts.map((k) => k.id)]),
    );
    loading.value = true;
    try {
      [clients.value, contracts.value, projects.value] = await Promise.all([
        clientsRepo.list(auth.uid!),
        contractsRepo.list(auth.uid!),
        projectsRepo.list(auth.uid!),
      ]);
    } catch (err) {
      toast.error('Impossibile caricare clienti e contratti', {
        description: extractErrorMessage(err),
      });
    } finally {
      loading.value = false;
    }
  },
);

async function submit() {
  if (!valid.value) return;
  submitting.value = true;
  try {
    const saved = await collaboratorsRepo.save({
      email: props.mode === 'edit' ? props.collaborator!.email : normalizedEmail.value,
      name: name.value.trim(),
      active: active.value,
      clients: buildCollaboratorClients(
        Object.entries(grants.value).map(([clientId, contractIds]) => ({ clientId, contractIds })),
        clients.value,
        contracts.value,
        projects.value,
      ),
      createdAt: props.collaborator?.createdAt ?? todayIso(),
    });
    toast.success(props.mode === 'create' ? 'Collaboratore creato' : 'Collaboratore aggiornato', {
      description: saved.name,
    });
    emit('saved', saved);
    emit('update:open', false);
  } catch (err) {
    toast.error('Impossibile salvare il collaboratore', { description: extractErrorMessage(err) });
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
    <DialogContent class="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>
          {{ mode === 'create' ? 'Nuovo collaboratore' : 'Modifica collaboratore' }}
        </DialogTitle>
        <DialogDescription>
          Vede solo Statino e Attività, sui clienti e contratti scelti qui. Tariffe e monte ore dei
          contratti non gli vengono mai mostrati.
        </DialogDescription>
      </DialogHeader>

      <form class="space-y-4" @submit.prevent="submit">
        <div class="space-y-2">
          <Label for="collab-email">Account Google</Label>
          <Input
            id="collab-email"
            v-model="email"
            type="email"
            placeholder="email@esempio.com"
            autocomplete="off"
            :disabled="submitting || mode === 'edit'"
          />
          <p v-if="emailError" class="text-xs text-destructive">{{ emailError }}</p>
        </div>

        <div class="space-y-2">
          <Label for="collab-name">Nome</Label>
          <Input
            id="collab-name"
            v-model="name"
            type="text"
            placeholder="Mario Rossi"
            autocomplete="off"
            :disabled="submitting"
          />
        </div>

        <div class="space-y-2">
          <Label>Clienti e contratti</Label>
          <div v-if="loading" class="space-y-2">
            <Skeleton class="h-9 w-full" />
            <Skeleton class="h-9 w-full" />
          </div>
          <p v-else-if="!clients.length" class="text-sm text-muted-foreground">
            Nessun cliente in anagrafica.
          </p>
          <ul v-else class="divide-y rounded-md border">
            <li v-for="c in clients" :key="c.id" class="p-3">
              <label class="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  class="size-4 accent-primary"
                  :checked="c.id in grants"
                  :disabled="submitting"
                  @change="toggleClient(c.id, ($event.target as HTMLInputElement).checked)"
                />
                {{ c.name }}
              </label>
              <div v-if="c.id in grants" class="mt-2 space-y-1.5 pl-6">
                <p v-if="!contractsOf(c.id).length" class="text-xs text-muted-foreground">
                  Questo cliente non ha contratti: non potrà inserire ore.
                </p>
                <label
                  v-for="k in contractsOf(c.id)"
                  :key="k.id"
                  class="flex items-start gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    class="mt-0.5 size-4 accent-primary"
                    :checked="grants[c.id].includes(k.id)"
                    :disabled="submitting"
                    @change="
                      toggleContract(c.id, k.id, ($event.target as HTMLInputElement).checked)
                    "
                  />
                  <span class="min-w-0">
                    {{ k.activity }}
                    <span class="block text-xs text-muted-foreground">
                      {{ formatDate(k.startDate) }} – {{ formatDate(k.endDate) }} ·
                      {{ contractState(k) }}
                    </span>
                  </span>
                </label>
                <p
                  v-if="contractsOf(c.id).length && !grants[c.id].length"
                  class="text-xs text-muted-foreground"
                >
                  Senza almeno un contratto vedrà il cliente ma non potrà inserire ore.
                </p>
              </div>
            </li>
          </ul>
        </div>

        <div class="flex items-center justify-between gap-4 rounded-md border p-3">
          <div>
            <Label for="collab-active">Accesso attivo</Label>
            <p class="text-xs text-muted-foreground">
              Spento non entra più; ore e attività restano consultabili da te.
            </p>
          </div>
          <Switch id="collab-active" v-model="active" :disabled="submitting" />
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
          <Button type="submit" size="sm" :disabled="submitting || !valid">
            {{ submitting ? 'Salvataggio…' : mode === 'create' ? 'Crea' : 'Salva' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
