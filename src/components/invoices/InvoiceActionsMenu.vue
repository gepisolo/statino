<script setup lang="ts">
// Il menu ⋯ della lista fatture, identico su tabella desktop e card mobile.
// Era duplicato verbatim nei due blocchi: passando da due a cinque voci la
// copia ha smesso di ripagarsi.
import { Banknote, ExternalLink, FileUp, Link2Off, MoreHorizontal, Trash2 } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Invoice } from '@/types/models';

const props = defineProps<{
  invoice: Invoice;
  /** Integrazione configurata: senza, le voci FIC non hanno senso. */
  ficEnabled: boolean;
  /** Classi del trigger, per il rientro della card mobile. */
  triggerClass?: string;
}>();

const emit = defineEmits<{
  (e: 'payment'): void;
  (e: 'fic'): void;
  (e: 'unlink-fic'): void;
  (e: 'delete'): void;
}>();

// Il link al PDF che FIC restituisce alla creazione è temporaneo: se è
// scaduto si apre comunque, ed è il loro sito a dirlo.
function openPdf() {
  const url = props.invoice.external?.url;
  if (url) window.open(url, '_blank', 'noopener');
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="icon" :class="triggerClass" aria-label="Azioni">
        <MoreHorizontal class="size-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem @select="emit('payment')">
        <Banknote class="mr-2 size-4" />
        {{ invoice.payment ? 'Modifica incasso…' : 'Registra incasso…' }}
      </DropdownMenuItem>

      <template v-if="ficEnabled || invoice.external">
        <DropdownMenuSeparator />
        <DropdownMenuItem v-if="ficEnabled && !invoice.external" @select="emit('fic')">
          <FileUp class="mr-2 size-4" />
          Crea fattura su Fatture in Cloud…
        </DropdownMenuItem>
        <template v-if="invoice.external">
          <DropdownMenuItem v-if="invoice.external.url" @select="openPdf">
            <ExternalLink class="mr-2 size-4" />
            Apri il PDF su Fatture in Cloud
          </DropdownMenuItem>
          <DropdownMenuItem @select="emit('unlink-fic')">
            <Link2Off class="mr-2 size-4" />
            Scollega da Fatture in Cloud…
          </DropdownMenuItem>
        </template>
      </template>

      <DropdownMenuSeparator />
      <DropdownMenuItem class="text-destructive focus:text-destructive" @select="emit('delete')">
        <Trash2 class="mr-2 size-4" />
        Elimina…
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
