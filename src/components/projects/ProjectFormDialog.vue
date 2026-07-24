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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { projectsRepo, extractErrorMessage } from '@/lib/db';
import { useAuthStore } from '@/stores/auth';
import type { Client, Project } from '@/types/models';

type Mode = 'create' | 'edit';

const props = defineProps<{
  open: boolean;
  mode: Mode;
  project: Project | null;
  clients: Client[];
}>();

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void;
  (e: 'saved', p: Project): void;
}>();

const auth = useAuthStore();

const clientId = ref('');
const name = ref('');
const submitting = ref(false);

const title = computed(() => (props.mode === 'create' ? 'Nuovo progetto' : 'Modifica progetto'));
const ctaLabel = computed(() => (props.mode === 'create' ? 'Crea progetto' : 'Salva modifiche'));
const valid = computed(() => clientId.value !== '' && name.value.trim().length > 0);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    if (props.mode === 'edit' && props.project) {
      clientId.value = props.project.clientId;
      name.value = props.project.name;
    } else {
      clientId.value = props.clients.length === 1 ? props.clients[0].id : '';
      name.value = '';
    }
  },
);

async function submit() {
  if (!valid.value) return;
  submitting.value = true;
  try {
    const data = { clientId: clientId.value, name: name.value.trim() };
    const saved =
      props.mode === 'create'
        ? await projectsRepo.create(auth.uid!, data)
        : await projectsRepo.update(auth.uid!, props.project!.id, data);
    toast.success(props.mode === 'create' ? 'Progetto creato' : 'Progetto aggiornato', {
      description: saved.name,
    });
    emit('saved', saved);
    emit('update:open', false);
  } catch (err) {
    toast.error(
      props.mode === 'create'
        ? 'Impossibile creare il progetto'
        : 'Impossibile salvare il progetto',
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
          I progetti servono per suddividere le ore quando il cliente lo richiede.
        </DialogDescription>
      </DialogHeader>

      <form class="space-y-4" @submit.prevent="submit">
        <div class="space-y-2">
          <Label for="project-client">Cliente</Label>
          <Select v-model="clientId" :disabled="submitting">
            <SelectTrigger id="project-client" class="w-full">
              <SelectValue placeholder="Seleziona un cliente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="c in clients" :key="c.id" :value="c.id">
                {{ c.name }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div class="space-y-2">
          <Label for="project-name">Nome</Label>
          <Input
            id="project-name"
            v-model="name"
            type="text"
            placeholder="Sito e-commerce"
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
