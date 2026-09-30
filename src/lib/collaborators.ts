import type { Client, Collaborator, CollaboratorClient, Contract, Project } from '@/types/models';

// Puro (nessun import Firebase): costruisce la copia ripulita delle
// anagrafiche che finisce sulla scheda del collaboratore, e la riconverte
// nelle forme che statino e attività già sanno usare.

// Cosa l'admin ha assegnato: per ogni cliente, quali contratti.
export interface CollaboratorGrant {
  clientId: string;
  contractIds: string[];
}

export function grantsOf(c: Collaborator): CollaboratorGrant[] {
  return c.clients.map((cl) => ({ clientId: cl.id, contractIds: cl.contracts.map((k) => k.id) }));
}

// Dai permessi alle copie: solo nome del cliente, attività e date del
// contratto — mai tariffa né monte ore. I progetti del cliente passano
// tutti (servono all'editor delle ore e non hanno nulla di riservato).
// Clienti e contratti nel frattempo eliminati spariscono.
export function buildCollaboratorClients(
  grants: CollaboratorGrant[],
  clients: Client[],
  contracts: Contract[],
  projects: Project[],
): CollaboratorClient[] {
  const out: CollaboratorClient[] = [];
  for (const g of grants) {
    const client = clients.find((c) => c.id === g.clientId);
    if (!client) continue;
    out.push({
      id: client.id,
      name: client.name,
      contracts: contracts
        .filter((k) => k.clientId === client.id && g.contractIds.includes(k.id))
        .map((k) => ({
          id: k.id,
          activity: k.activity,
          startDate: k.startDate,
          endDate: k.endDate,
        })),
      projects: projects
        .filter((p) => p.clientId === client.id)
        .map((p) => ({
          id: p.id,
          name: p.name,
          active: p.active !== false,
          bgColor: p.bgColor ?? null,
          textColor: p.textColor ?? null,
        })),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export interface Catalogs {
  clients: Client[];
  contracts: Contract[];
  projects: Project[];
}

// Le copie nelle forme delle anagrafiche vere. Tariffa e monte ore non
// esistono sulla scheda: valgono 0 e le viste, nello spazio di un
// collaboratore, non mostrano importi né avanzamento dei contratti.
export function collaboratorCatalogs(c: Collaborator): Catalogs {
  const clients: Client[] = [];
  const contracts: Contract[] = [];
  const projects: Project[] = [];
  for (const cl of c.clients) {
    clients.push({ id: cl.id, name: cl.name });
    for (const k of cl.contracts) {
      contracts.push({ ...k, clientId: cl.id, annualHours: 0, hourlyRate: 0 });
    }
    for (const p of cl.projects) {
      projects.push({ ...p, clientId: cl.id });
    }
  }
  return { clients, contracts, projects };
}
