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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { integrationsRepo, extractErrorMessage } from '@/lib/db';
import { defaultFicConfig, type FicCompany } from '@/lib/fattureincloud';
import { ficCompanies, ficErrorMessage } from '@/lib/fattureincloudApi';
import { todayIso } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';
import type { FicConfig } from '@/types/models';

const props = defineProps<{
  open: boolean;
  config: FicConfig | null;
}>();

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void;
  (e: 'saved', c: FicConfig): void;
}>();

const auth = useAuthStore();

const token = ref('');
const companies = ref<FicCompany[]>([]);
const companyId = ref('');
const verifying = ref(false);
const submitting = ref(false);

const title = computed(() =>
  props.config ? 'Aggiorna il token Fatture in Cloud' : 'Collega Fatture in Cloud',
);
// Il token si verifica prima di salvarlo: finché non ha restituito almeno
// un'azienda non c'è niente da confermare.
const valid = computed(() => companies.value.length > 0 && companyId.value !== '');

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    token.value = '';
    companies.value = [];
    companyId.value = '';
  },
);

async function verify() {
  const value = token.value.trim();
  if (!value) return;
  verifying.value = true;
  try {
    // Il token viaggia inline solo per questa verifica e non viene
    // salvato: se fosse sbagliato, scriverlo prima cancellerebbe quello
    // buono già configurato.
    companies.value = await ficCompanies(value);
    if (!companies.value.length) {
      toast.error('Token valido ma nessuna azienda collegata', {
        description: "Controlla i permessi concessi all'app su Fatture in Cloud.",
      });
      return;
    }
    const previous = companies.value.find((c) => c.id === props.config?.companyId);
    companyId.value = String((previous ?? companies.value[0]).id);
    toast.success('Token valido', {
      description: `${companies.value.length} azienda/e disponibili`,
    });
  } catch (err) {
    companies.value = [];
    toast.error('Verifica fallita', { description: ficErrorMessage(err) });
  } finally {
    verifying.value = false;
  }
}

function maskToken(v: string): string {
  return `••••••••${v.slice(-4)}`;
}

async function submit() {
  if (!valid.value) return;
  const company = companies.value.find((c) => String(c.id) === companyId.value);
  if (!company) return;
  submitting.value = true;
  try {
    await integrationsRepo.setFicToken(auth.uid!, token.value.trim());
    // ⚠️ saveFic è un setDoc pieno: la config esistente va riportata tutta,
    // o si perdono parametri fiscali e mappature.
    const base = props.config
      ? { ...props.config, companyId: company.id, companyName: company.name }
      : defaultFicConfig(company.id, company.name);
    const saved = await integrationsRepo.saveFic(auth.uid!, {
      ...base,
      tokenHint: maskToken(token.value.trim()),
      tokenUpdatedAt: todayIso(),
    });
    toast.success('Fatture in Cloud collegato', { description: company.name });
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
  if (submitting.value || verifying.value) return;
  emit('update:open', v);
}
</script>

<template>
  <Dialog :open="open" @update:open="handleOpenChange">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription>
          Sul sito di Fatture in Cloud: Impostazioni → Applicazioni collegate → collega l'app con il
          suo Client ID, scegli l'azienda e i permessi, poi incolla qui l'access token. Non scade,
          ma può essere revocato da lì.
        </DialogDescription>
      </DialogHeader>

      <form class="space-y-4" @submit.prevent="submit">
        <div class="space-y-2">
          <Label for="fic-token">Access token</Label>
          <Textarea
            id="fic-token"
            v-model="token"
            rows="3"
            class="font-mono text-xs"
            placeholder="a/eyJ0eXAiOiJKV1Qi…"
            :disabled="verifying || submitting"
            autocomplete="off"
            spellcheck="false"
          />
          <p class="text-xs text-muted-foreground">
            Viene salvato in modo che solo il server possa rileggerlo.
          </p>
        </div>

        <div class="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            :disabled="verifying || submitting || !token.trim()"
            @click="verify"
          >
            {{ verifying ? 'Verifica…' : 'Verifica token' }}
          </Button>
        </div>

        <div v-if="companies.length" class="space-y-2">
          <Label for="fic-company">Azienda</Label>
          <Select v-model="companyId" :disabled="submitting">
            <SelectTrigger id="fic-company" class="w-full">
              <SelectValue placeholder="Scegli l'azienda" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="c in companies" :key="c.id" :value="String(c.id)">
                {{ c.name }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            :disabled="submitting || verifying"
            @click="handleOpenChange(false)"
          >
            Annulla
          </Button>
          <Button type="submit" size="sm" :disabled="submitting || verifying || !valid">
            {{ submitting ? 'Salvataggio…' : 'Salva collegamento' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
