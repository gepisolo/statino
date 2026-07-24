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
import { projectsRepo, extractErrorMessage } from '@/lib/db';
import { useAuthStore } from '@/stores/auth';
import type { Project } from '@/types/models';

type Mode = 'create' | 'edit';

const props = defineProps<{
  open: boolean;
  mode: Mode;
  project: Project | null;
  // Owner of the project: the dialog lives in the per-client projects page.
  clientId: string;
}>();

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void;
  (e: 'saved', p: Project): void;
}>();

const auth = useAuthStore();

const name = ref('');
const submitting = ref(false);

const title = computed(() => (props.mode === 'create' ? 'Nuovo progetto' : 'Modifica progetto'));
const ctaLabel = computed(() => (props.mode === 'create' ? 'Crea progetto' : 'Salva modifiche'));
const valid = computed(() => name.value.trim().length > 0);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    name.value = props.mode === 'edit' && props.project ? props.project.name : '';
  },
);

async function submit() {
  if (!valid.value) return;
  submitting.value = true;
  try {
    const data = {
      clientId: props.clientId,
      name: name.value.trim(),
      active: props.mode === 'edit' ? props.project!.active !== false : true,
    };
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
