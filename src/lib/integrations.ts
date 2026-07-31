// Catalogo dei connettori. Tipo e provider sono enum di codice, non testo
// libero: un tipo implica un comportamento (la fatturazione sa creare
// fatture) e un provider implica un'API da parlare. Aggiungerne uno vuole
// codice, non solo una riga di configurazione — questo elenco serve a
// mostrarli e a guidare la creazione, non a renderli dinamici.

import type { IntegrationProvider, IntegrationType } from '@/types/models';

export const TYPE_LABELS: Record<IntegrationType, string> = {
  fatturazione: 'Fatturazione',
};

export const PROVIDER_LABELS: Record<IntegrationProvider, string> = {
  fattureincloud: 'Fatture in Cloud',
};

export const PROVIDERS_BY_TYPE: Record<IntegrationType, IntegrationProvider[]> = {
  fatturazione: ['fattureincloud'],
};

export const INTEGRATION_TYPES = Object.keys(TYPE_LABELS) as IntegrationType[];
