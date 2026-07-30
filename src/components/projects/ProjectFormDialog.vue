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
import {
  BADGE_CLASS,
  BADGE_FALLBACK_CLASS,
  BADGE_PRESETS,
  DEFAULT_BADGE,
  contrastRatio,
} from '@/lib/colors';
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

// Colors are opt-in: `colored` off saves null/null and the badge keeps
// the theme default (the only variant that follows light/dark).
const colored = ref(false);
const bgColor = ref(DEFAULT_BADGE.bg);
const textColor = ref(DEFAULT_BADGE.text);

const contrast = computed(() => contrastRatio(bgColor.value, textColor.value));
// Below AA for small text: still saveable, just flagged.
const lowContrast = computed(() => colored.value && contrast.value < 4.5);

function applyPreset(p: { bg: string; text: string }) {
  bgColor.value = p.bg;
  textColor.value = p.text;
  colored.value = true;
}

function resetColors() {
  colored.value = false;
  bgColor.value = DEFAULT_BADGE.bg;
  textColor.value = DEFAULT_BADGE.text;
}

const title = computed(() => (props.mode === 'create' ? 'Nuovo progetto' : 'Modifica progetto'));
const ctaLabel = computed(() => (props.mode === 'create' ? 'Crea progetto' : 'Salva modifiche'));
const valid = computed(() => name.value.trim().length > 0);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    const p = props.mode === 'edit' ? props.project : null;
    name.value = p ? p.name : '';
    resetColors();
    if (p?.bgColor && p?.textColor) {
      colored.value = true;
      bgColor.value = p.bgColor;
      textColor.value = p.textColor;
    }
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
      bgColor: colored.value ? bgColor.value : null,
      textColor: colored.value ? textColor.value : null,
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

        <div class="space-y-2.5">
          <div class="flex items-center justify-between gap-2">
            <Label>Colori del badge</Label>
            <button
              v-if="colored"
              type="button"
              class="cursor-pointer text-xs text-muted-foreground hover:text-foreground"
              :disabled="submitting"
              @click="resetColors"
            >
              Ripristina predefiniti
            </button>
          </div>

          <div class="flex flex-wrap items-center gap-3">
            <span
              :class="colored ? BADGE_CLASS : `${BADGE_CLASS} ${BADGE_FALLBACK_CLASS}`"
              :style="colored ? { backgroundColor: bgColor, color: textColor } : undefined"
            >
              {{ name.trim() || 'Anteprima' }}
            </span>
            <label class="flex items-center gap-1.5 text-xs text-muted-foreground">
              Sfondo
              <input
                v-model="bgColor"
                type="color"
                class="h-7 w-9 cursor-pointer rounded border bg-transparent p-0.5"
                :disabled="submitting"
                aria-label="Colore di sfondo"
                @input="colored = true"
              />
            </label>
            <label class="flex items-center gap-1.5 text-xs text-muted-foreground">
              Testo
              <input
                v-model="textColor"
                type="color"
                class="h-7 w-9 cursor-pointer rounded border bg-transparent p-0.5"
                :disabled="submitting"
                aria-label="Colore del testo"
                @input="colored = true"
              />
            </label>
          </div>

          <p v-if="lowContrast" class="text-xs text-amber-600 dark:text-amber-500">
            Contrasto {{ contrast.toFixed(1) }}:1 — sotto la soglia di leggibilità (4,5:1). Puoi
            salvare comunque.
          </p>

          <div>
            <p class="mb-1.5 text-xs text-muted-foreground">
              Accoppiamenti pronti (tutti leggibili su chiaro e scuro):
            </p>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="p in BADGE_PRESETS"
                :key="p.name"
                type="button"
                :class="[
                  BADGE_CLASS,
                  'cursor-pointer',
                  colored && bgColor === p.bg && textColor === p.text
                    ? 'ring-2 ring-ring ring-offset-1 ring-offset-background'
                    : '',
                ]"
                :style="{ backgroundColor: p.bg, color: p.text }"
                :disabled="submitting"
                @click="applyPreset(p)"
              >
                {{ p.name }}
              </button>
            </div>
          </div>
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
