<script setup lang="ts">
// Creazione in due passi: prima il tipo, poi i provider disponibili per quel
// tipo. Il connettore nasce scollegato — il token si incolla nel dettaglio,
// dove c'è la verifica.
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
import { integrationsRepo, extractErrorMessage } from '@/lib/db';
import { defaultFicConfig } from '@/lib/fattureincloud';
import {
  INTEGRATION_TYPES,
  PROVIDERS_BY_TYPE,
  PROVIDER_LABELS,
  TYPE_LABELS,
} from '@/lib/integrations';
import { useAuthStore } from '@/stores/auth';
import type { Integration, IntegrationProvider, IntegrationType } from '@/types/models';

defineProps<{ open: boolean }>();

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void;
  (e: 'created', i: Integration): void;
}>();

const auth = useAuthStore();

const type = ref<IntegrationType | ''>('');
const provider = ref<IntegrationProvider | ''>('');
const title = ref('');
const submitting = ref(false);

const providers = computed(() => (type.value ? PROVIDERS_BY_TYPE[type.value] : []));
const valid = computed(
  () => type.value !== '' && provider.value !== '' && title.value.trim() !== '',
);

watch(
  () => type.value,
  (t) => {
    // Con un provider solo per tipo, sceglierlo a mano è un passo inutile.
    const list = t ? PROVIDERS_BY_TYPE[t] : [];
    provider.value = list.length === 1 ? list[0] : '';
  },
);

// Il titolo predefinito è il nome del provider: si distinguono comunque due
// connettori uguali, e chi ne ha uno solo non deve inventarsi niente.
watch(
  () => provider.value,
  (p) => {
    if (p && !title.value.trim()) title.value = PROVIDER_LABELS[p];
  },
);

async function submit() {
  if (!valid.value || type.value === '' || provider.value === '') return;
  submitting.value = true;
  try {
    const created = await integrationsRepo.create(auth.uid!, {
      type: type.value,
      provider: provider.value,
      title: title.value.trim(),
      config: defaultFicConfig(0, ''),
    });
    toast.success('Integrazione creata', { description: 'Ora collegala incollando il token.' });
    emit('created', created);
    emit('update:open', false);
  } catch (err) {
    toast.error("Impossibile creare l'integrazione", {
      description: extractErrorMessage(err),
    });
  } finally {
    submitting.value = false;
  }
}

function handleOpenChange(v: boolean) {
  if (submitting.value) return;
  if (v) {
    type.value = '';
    provider.value = '';
    title.value = '';
  }
  emit('update:open', v);
}
</script>

<template>
  <Dialog :open="open" @update:open="handleOpenChange">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Nuova integrazione</DialogTitle>
        <DialogDescription>
          Scegli cosa deve fare il connettore e con quale servizio. Il collegamento vero e proprio
          si fa subito dopo.
        </DialogDescription>
      </DialogHeader>

      <form class="space-y-4" @submit.prevent="submit">
        <div class="space-y-2">
          <Label for="integration-type">Tipo</Label>
          <Select v-model="type" :disabled="submitting">
            <SelectTrigger id="integration-type" class="w-full">
              <SelectValue placeholder="Scegli il tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="t in INTEGRATION_TYPES" :key="t" :value="t">
                {{ TYPE_LABELS[t] }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div v-if="type" class="space-y-2">
          <Label for="integration-provider">Servizio</Label>
          <Select v-model="provider" :disabled="submitting">
            <SelectTrigger id="integration-provider" class="w-full">
              <SelectValue placeholder="Scegli il servizio" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="p in providers" :key="p" :value="p">
                {{ PROVIDER_LABELS[p] }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div v-if="provider" class="space-y-2">
          <Label for="integration-title">Titolo</Label>
          <Input
            id="integration-title"
            v-model="title"
            type="text"
            placeholder="Jedisoft"
            :disabled="submitting"
            autocomplete="off"
          />
          <p class="text-xs text-muted-foreground">
            Come lo chiami tu, per riconoscerlo quando crei una fattura.
          </p>
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
            {{ submitting ? 'Creazione…' : 'Crea' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
