<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { toast } from 'vue-sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { extractErrorMessage } from '@/lib/db';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';
import { useWorkspaceStore } from '@/stores/workspace';
import type { HTMLAttributes } from 'vue';

// Selettore "Collaboratore" di Statino e Attività. Lo vede solo l'admin, e
// solo se ha almeno un collaboratore: la scelta vive nello store, quindi
// passando da una pagina all'altra si resta sullo stesso.
const props = defineProps<{ class?: HTMLAttributes['class'] }>();

const auth = useAuthStore();
const ws = useWorkspaceStore();

// reka-ui non accetta '' come valore di un SelectItem.
const ME = 'me';

const value = computed({
  get: () => ws.selectedEmail ?? ME,
  set: (v: string) => ws.select(v === ME ? null : v),
});

onMounted(async () => {
  try {
    await ws.ensureCollaborators();
  } catch (err) {
    toast.error('Impossibile caricare i collaboratori', { description: extractErrorMessage(err) });
  }
});
</script>

<template>
  <Select v-if="auth.isAdmin && ws.collaborators.length" v-model="value">
    <SelectTrigger :class="cn('w-full sm:w-48', props.class)" aria-label="Collaboratore">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem :value="ME">I miei dati</SelectItem>
      <SelectItem v-for="c in ws.collaborators" :key="c.email" :value="c.email">
        {{ c.name }}
      </SelectItem>
    </SelectContent>
  </Select>
</template>
