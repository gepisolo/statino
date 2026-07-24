<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { toast } from 'vue-sonner';
import { Trash2 } from '@lucide/vue';
import { db } from '@/lib/firebase';
import { ADMIN_EMAIL } from '@/lib/config';
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

onMounted(async () => {
  try {
    const snap = await getDocs(collection(db, 'allowedUsers'));
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
  if (email === ADMIN_EMAIL || emails.value.includes(email)) {
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
