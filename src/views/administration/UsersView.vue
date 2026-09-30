<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { toast } from 'vue-sonner';
import { Pencil, Plus, Trash2 } from '@lucide/vue';
import { db } from '@/lib/firebase';
import { ADMIN_EMAIL } from '@/lib/config';
import { collaboratorsRepo, extractErrorMessage } from '@/lib/db';
import { useWorkspaceStore } from '@/stores/workspace';
import CollaboratorFormDialog from '@/components/collaborators/CollaboratorFormDialog.vue';
import type { Collaborator } from '@/types/models';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

const loading = ref(true);
const emails = ref<string[]>([]);

const newEmail = ref('');
const adding = ref(false);

const deleteTarget = ref<string | null>(null);
const deleteOpen = ref(false);
const deleting = ref(false);

// --- Collaboratori: l'elenco vive nello store, è lo stesso che alimenta
// il selettore "Collaboratore" di Statino e Attività. ---
const ws = useWorkspaceStore();

const collabFormOpen = ref(false);
const collabFormMode = ref<'create' | 'edit'>('create');
const collabFormTarget = ref<Collaborator | null>(null);

const collabDeleteTarget = ref<Collaborator | null>(null);
const collabDeleteOpen = ref(false);
const collabDeleting = ref(false);

const takenEmails = computed(() => [
  ADMIN_EMAIL,
  ...emails.value,
  ...ws.collaborators.map((c) => c.email),
]);

function openCreateCollab() {
  collabFormMode.value = 'create';
  collabFormTarget.value = null;
  collabFormOpen.value = true;
}

function openEditCollab(c: Collaborator) {
  collabFormMode.value = 'edit';
  collabFormTarget.value = c;
  collabFormOpen.value = true;
}

function onCollabSaved(c: Collaborator) {
  const others = ws.collaborators.filter((x) => x.email !== c.email);
  ws.collaborators = [...others, c].sort((a, b) => a.name.localeCompare(b.name));
}

function askDeleteCollab(c: Collaborator) {
  collabDeleteTarget.value = c;
  collabDeleteOpen.value = true;
}

async function onDeleteCollab() {
  const c = collabDeleteTarget.value;
  if (!c) return;
  collabDeleting.value = true;
  try {
    await collaboratorsRepo.removeCascade(c.email);
    ws.collaborators = ws.collaborators.filter((x) => x.email !== c.email);
    if (ws.selectedEmail === c.email) ws.select(null);
    toast.success(`${c.name} eliminato`);
    collabDeleteOpen.value = false;
  } catch (err) {
    toast.error("Errore nell'eliminazione", { description: extractErrorMessage(err) });
  } finally {
    collabDeleting.value = false;
  }
}

onMounted(async () => {
  try {
    const [snap] = await Promise.all([
      getDocs(collection(db, 'allowedUsers')),
      ws.ensureCollaborators(),
    ]);
    emails.value = snap.docs.map((d) => d.id).sort();
  } catch (err) {
    toast.error('Errore nel caricamento degli utenti', {
      description: err instanceof Error ? err.message : String(err),
    });
  } finally {
    loading.value = false;
  }
});

async function onAdd() {
  const email = newEmail.value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    toast.error('Inserisci un indirizzo email valido');
    return;
  }
  if (takenEmails.value.includes(email)) {
    toast.info('Questo utente è già abilitato');
    return;
  }
  adding.value = true;
  try {
    await setDoc(doc(db, 'allowedUsers', email), { addedAt: serverTimestamp() });
    emails.value = [...emails.value, email].sort();
    newEmail.value = '';
    toast.success(`${email} abilitato`);
  } catch (err) {
    toast.error("Errore nell'abilitazione", {
      description: err instanceof Error ? err.message : String(err),
    });
  } finally {
    adding.value = false;
  }
}

function askDelete(email: string) {
  deleteTarget.value = email;
  deleteOpen.value = true;
}

async function onDelete() {
  if (!deleteTarget.value) return;
  deleting.value = true;
  try {
    await deleteDoc(doc(db, 'allowedUsers', deleteTarget.value));
    emails.value = emails.value.filter((e) => e !== deleteTarget.value);
    toast.success(`${deleteTarget.value} rimosso`);
    deleteOpen.value = false;
  } catch (err) {
    toast.error('Errore nella rimozione', {
      description: err instanceof Error ? err.message : String(err),
    });
  } finally {
    deleting.value = false;
  }
}
</script>

<template>
  <div class="mx-auto max-w-2xl">
    <h1 class="text-xl font-semibold tracking-tight">Utenti abilitati</h1>
    <p class="mt-1 text-sm text-muted-foreground">
      Solo gli account Google in questa lista (oltre al tuo) possono usare Statino.
    </p>

    <form class="mt-6 flex gap-2" @submit.prevent="onAdd">
      <Input
        v-model="newEmail"
        type="email"
        placeholder="email@esempio.com"
        class="flex-1"
        :disabled="adding"
      />
      <Button type="submit" :disabled="adding">Abilita</Button>
    </form>

    <div v-if="loading" class="mt-6 space-y-2">
      <Skeleton class="h-10 w-full" />
      <Skeleton class="h-10 w-full" />
    </div>

    <Table v-else class="mt-6">
      <TableHeader>
        <TableRow>
          <TableHead>Email</TableHead>
          <TableHead class="w-16" />
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell class="font-medium">{{ ADMIN_EMAIL }}</TableCell>
          <TableCell class="text-right text-xs text-muted-foreground">admin</TableCell>
        </TableRow>
        <TableRow v-for="email in emails" :key="email">
          <TableCell>{{ email }}</TableCell>
          <TableCell class="text-right">
            <Button variant="ghost" size="icon" @click="askDelete(email)">
              <Trash2 class="size-4 text-destructive" />
            </Button>
          </TableCell>
        </TableRow>
        <TableRow v-if="emails.length === 0">
          <TableCell colspan="2" class="text-center text-sm text-muted-foreground">
            Nessun altro utente abilitato.
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>

    <div class="mt-10 flex items-start justify-between gap-4">
      <div>
        <h2 class="text-lg font-semibold tracking-tight">Collaboratori</h2>
        <p class="mt-1 text-sm text-muted-foreground">
          Lavorano sui tuoi clienti: vedono solo Statino e Attività, limitati ai clienti e ai
          contratti che assegni.
        </p>
      </div>
      <Button size="sm" class="shrink-0" @click="openCreateCollab">
        <Plus class="size-4" />
        Nuovo
      </Button>
    </div>

    <div v-if="loading" class="mt-6 space-y-2">
      <Skeleton class="h-10 w-full" />
    </div>

    <ul v-else-if="ws.collaborators.length" class="mt-6 divide-y rounded-md border">
      <li v-for="c in ws.collaborators" :key="c.email" class="flex items-start gap-3 p-3">
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-x-2 text-sm font-medium">
            {{ c.name }}
            <span
              v-if="!c.active"
              class="rounded bg-secondary px-1.5 py-0.5 text-xs font-normal text-secondary-foreground"
            >
              accesso sospeso
            </span>
          </div>
          <div class="truncate text-xs text-muted-foreground">{{ c.email }}</div>
          <div class="mt-1 text-xs text-muted-foreground">
            <template v-if="c.clients.length">
              {{ c.clients.map((cl) => `${cl.name} (${cl.contracts.length})`).join(' · ') }}
            </template>
            <template v-else>Nessun cliente assegnato</template>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          :aria-label="`Modifica ${c.name}`"
          @click="openEditCollab(c)"
        >
          <Pencil class="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          :aria-label="`Elimina ${c.name}`"
          @click="askDeleteCollab(c)"
        >
          <Trash2 class="size-4 text-destructive" />
        </Button>
      </li>
    </ul>

    <p
      v-else
      class="mt-6 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground"
    >
      Nessun collaboratore.
    </p>

    <CollaboratorFormDialog
      v-model:open="collabFormOpen"
      :mode="collabFormMode"
      :collaborator="collabFormTarget"
      :taken-emails="takenEmails"
      @saved="onCollabSaved"
    />

    <Dialog v-model:open="collabDeleteOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Eliminare il collaboratore?</DialogTitle>
          <DialogDescription>
            {{ collabDeleteTarget?.name }} non potrà più accedere, e il suo statino e le sue
            attività vengono cancellati per sempre. Per togliere solo l'accesso conservando i dati,
            spegni "Accesso attivo" dalla modifica.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" :disabled="collabDeleting" @click="collabDeleteOpen = false">
            Annulla
          </Button>
          <Button variant="destructive" :disabled="collabDeleting" @click="onDeleteCollab">
            {{ collabDeleting ? 'Eliminazione…' : 'Elimina tutto' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="deleteOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rimuovere l'utente?</DialogTitle>
          <DialogDescription>
            {{ deleteTarget }} non potrà più accedere a Statino. I suoi dati non vengono cancellati.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" :disabled="deleting" @click="deleteOpen = false">
            Annulla
          </Button>
          <Button variant="destructive" :disabled="deleting" @click="onDelete">Rimuovi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
