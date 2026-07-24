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
import { clientsRepo, extractErrorMessage } from '@/lib/db';
import { useAuthStore } from '@/stores/auth';
import type { Client } from '@/types/models';

type Mode = 'create' | 'edit';

const props = defineProps<{
  open: boolean;
  mode: Mode;
  client: Client | null;
}>();

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void;
  (e: 'saved', c: Client): void;
}>();

const auth = useAuthStore();

const name = ref('');
const submitting = ref(false);

const title = computed(() => (props.mode === 'create' ? 'Nuovo cliente' : 'Modifica cliente'));
const ctaLabel = computed(() => (props.mode === 'create' ? 'Crea cliente' : 'Salva modifiche'));
const valid = computed(() => name.value.trim().length > 0);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    name.value = props.mode === 'edit' && props.client ? props.client.name : '';
  },
);

async function submit() {
  if (!valid.value) return;
  submitting.value = true;
  try {
    const data = { name: name.value.trim() };
    const saved =
      props.mode === 'create'
        ? await clientsRepo.create(auth.uid!, data)
        : await clientsRepo.update(auth.uid!, props.client!.id, data);
    toast.success(props.mode === 'create' ? 'Cliente creato' : 'Cliente aggiornato', {
      description: saved.name,
    });
    emit('saved', saved);
    emit('update:open', false);
  } catch (err) {
    toast.error(
      props.mode === 'create' ? 'Impossibile creare il cliente' : 'Impossibile salvare il cliente',
      { description: extractErrorMessage(err) },
    );
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
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription>
          I contratti e i progetti fanno riferimento al cliente.
        </DialogDescription>
      </DialogHeader>

      <form class="space-y-4" @submit.prevent="submit">
        <div class="space-y-2">
          <Label for="client-name">Nome</Label>
          <Input
            id="client-name"
            v-model="name"
            type="text"
            placeholder="Acme S.r.l."
            :disabled="submitting"
            autocomplete="off"
          />
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
            {{ submitting ? 'Salvataggio…' : ctaLabel }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
