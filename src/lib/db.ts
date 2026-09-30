import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, firebaseAuth } from '@/lib/firebase';
import { ADMIN_EMAIL } from '@/lib/config';
import { buildCollaboratorClients, grantsOf } from '@/lib/collaborators';
import { todayIso } from '@/lib/format';
import type {
  Client,
  Collaborator,
  Contract,
  Entry,
  FiscalYear,
  Integration,
  Invoice,
  InvoiceExternalFic,
  InvoicePayment,
  Project,
  Task,
  TaskStatus,
  TaxRate,
} from '@/types/models';

// Thin typed CRUD helpers over the per-user subcollections
// (users/{uid}/<name>). Views call these directly — the Firestore
// equivalent of earsup's "components call http directly" convention.
// Sorting happens client-side: volumes are tiny and it avoids composite
// indexes.
//
// `base` è la collection radice: 'users' (chiave = uid) per i dati del
// proprietario, 'collaborators' (chiave = email) per ore e attività di un
// collaboratore. Il parametro resta chiamato `uid` perché è il caso normale.

type Base = 'users' | 'collaborators';

function makeRepo<T extends { id: string }>(
  name: string,
  sort: (a: T, b: T) => number,
  base: Base = 'users',
) {
  const col = (uid: string) => collection(db, base, uid, name);
  return {
    async list(uid: string): Promise<T[]> {
      const snap = await getDocs(col(uid));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T).sort(sort);
    },
    async create(uid: string, data: Omit<T, 'id'>): Promise<T> {
      const ref = await addDoc(col(uid), data);
      return { id: ref.id, ...data } as T;
    },
    async update(uid: string, id: string, data: Omit<T, 'id'>): Promise<T> {
      await setDoc(doc(db, base, uid, name, id), data);
      return { id, ...data } as T;
    },
    async remove(uid: string, id: string): Promise<void> {
      await deleteDoc(doc(db, base, uid, name, id));
    },
  };
}

type Repo<T extends { id: string }> = ReturnType<typeof makeRepo<T>>;

// Le anagrafiche da cui sono copiate le schede dei collaboratori: ogni
// scrittura riallinea le copie (vedi `syncCollaborators`).
function synced<T extends { id: string }>(repo: Repo<T>): Repo<T> {
  return {
    list: repo.list,
    async create(uid, data) {
      const saved = await repo.create(uid, data);
      await syncCollaborators(uid);
      return saved;
    },
    async update(uid, id, data) {
      const saved = await repo.update(uid, id, data);
      await syncCollaborators(uid);
      return saved;
    },
    async remove(uid, id) {
      await repo.remove(uid, id);
      await syncCollaborators(uid);
    },
  };
}

export const clientsRepo = {
  ...synced(makeRepo<Client>('clients', (a, b) => a.name.localeCompare(b.name))),
  // Deleting a client (only allowed when it has no statino hours) also
  // drops its contracts and projects: without the client they would be
  // unreachable orphans.
  async removeCascade(uid: string, id: string): Promise<void> {
    const [contracts, projects] = await Promise.all([
      getDocs(query(collection(db, 'users', uid, 'contracts'), where('clientId', '==', id))),
      getDocs(query(collection(db, 'users', uid, 'projects'), where('clientId', '==', id))),
    ]);
    const batch = writeBatch(db);
    for (const d of [...contracts.docs, ...projects.docs]) {
      batch.delete(d.ref);
    }
    batch.delete(doc(db, 'users', uid, 'clients', id));
    await batch.commit();
    await syncCollaborators(uid);
  },
};

export const projectsRepo = synced(
  makeRepo<Project>('projects', (a, b) => a.name.localeCompare(b.name)),
);

// Newest first: recent contracts are the ones being worked against.
export const contractsRepo = synced(
  makeRepo<Contract>('contracts', (a, b) => b.startDate.localeCompare(a.startDate)),
);

// Entries are loaded a calendar year at a time (single-field range query,
// no composite index): the statino view needs the whole year anyway to
// compute per-contract progress against the annual allowance.
function makeEntriesRepo(base: Base) {
  return {
    ...makeRepo<Entry>('entries', (a, b) => a.date.localeCompare(b.date), base),
    async listRange(uid: string, from: string, to: string): Promise<Entry[]> {
      const snap = await getDocs(
        query(
          collection(db, base, uid, 'entries'),
          where('date', '>=', from),
          where('date', '<=', to),
        ),
      );
      return snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as Entry)
        .sort((a, b) => a.date.localeCompare(b.date));
    },
    async listYear(uid: string, year: number): Promise<Entry[]> {
      return this.listRange(uid, `${year}-01-01`, `${year}-12-31`);
    },
    // The entries billed by an invoice: the FIC dialog needs them to build
    // the document's lines.
    async listByInvoice(uid: string, invoiceId: string): Promise<Entry[]> {
      const snap = await getDocs(
        query(collection(db, base, uid, 'entries'), where('invoiceId', '==', invoiceId)),
      );
      return snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as Entry)
        .sort((a, b) => a.date.localeCompare(b.date));
    },
    // Guard for client deletion: any hour logged for the client, in any
    // year, blocks it.
    async existsForClient(uid: string, clientId: string): Promise<boolean> {
      const snap = await getDocs(
        query(collection(db, base, uid, 'entries'), where('clientId', '==', clientId), limit(1)),
      );
      return !snap.empty;
    },
  };
}

export const entriesRepo = makeEntriesRepo('users');
export const collabEntriesRepo = makeEntriesRepo('collaborators');
export type EntriesRepo = typeof entriesRepo;

// Creating an invoice locks the billed entries (sets their `invoiceId`);
// deleting it unlocks them. Both run in a single atomic batch.
export const invoicesRepo = {
  // Newest first by issue date (pre-existing docs without one fall back
  // to the billed period's start).
  ...makeRepo<Invoice>('invoices', (a, b) =>
    (b.date ?? b.dateFrom).localeCompare(a.date ?? a.dateFrom),
  ),
  async createWithEntries(
    uid: string,
    data: Omit<Invoice, 'id'>,
    entryIds: string[],
  ): Promise<Invoice> {
    const batch = writeBatch(db);
    const ref = doc(collection(db, 'users', uid, 'invoices'));
    batch.set(ref, data);
    for (const id of entryIds) {
      batch.update(doc(db, 'users', uid, 'entries', id), { invoiceId: ref.id });
    }
    await batch.commit();
    return { id: ref.id, ...data };
  },
  // Backfills the issue date on invoices created before the field existed.
  async setDate(uid: string, id: string, date: string): Promise<void> {
    await updateDoc(doc(db, 'users', uid, 'invoices', id), { date });
  },
  // Records (or clears, with null) what was collected for the invoice.
  async setPayment(uid: string, id: string, payment: InvoicePayment | null): Promise<void> {
    await updateDoc(doc(db, 'users', uid, 'invoices', id), { payment });
  },
  // Links (or unlinks, with null) the document created on Fatture in Cloud.
  async setExternal(uid: string, id: string, external: InvoiceExternalFic | null): Promise<void> {
    await updateDoc(doc(db, 'users', uid, 'invoices', id), { external });
  },
  async removeWithEntries(uid: string, id: string): Promise<void> {
    const snap = await getDocs(
      query(collection(db, 'users', uid, 'entries'), where('invoiceId', '==', id)),
    );
    const batch = writeBatch(db);
    for (const d of snap.docs) {
      batch.update(d.ref, { invoiceId: null });
    }
    batch.delete(doc(db, 'users', uid, 'invoices', id));
    await batch.commit();
  },
};

// Kanban tasks, sorted by manual position. A drop rewrites the whole
// target column's orders (and possibly the moved task's status) in one
// batch: volumes are tiny.
function makeTasksRepo(base: Base) {
  return {
    ...makeRepo<Task>('tasks', (a, b) => a.order - b.order, base),
    // One-click archiving from the board: only the flag and the position
    // in the archive change — the done outcome (and its doneAt) stay put.
    async archive(uid: string, id: string, order: number): Promise<void> {
      await updateDoc(doc(db, base, uid, 'tasks', id), { archived: true, order });
    },
    async reorder(
      uid: string,
      updates: { id: string; order: number; status?: TaskStatus; doneAt?: string | null }[],
    ): Promise<void> {
      const batch = writeBatch(db);
      for (const u of updates) {
        batch.update(doc(db, base, uid, 'tasks', u.id), {
          order: u.order,
          ...(u.status !== undefined ? { status: u.status } : {}),
          ...(u.doneAt !== undefined ? { doneAt: u.doneAt } : {}),
        });
      }
      await batch.commit();
    },
  };
}

export const tasksRepo = makeTasksRepo('users');
export const collabTasksRepo = makeTasksRepo('collaborators');
export type TasksRepo = typeof tasksRepo;

// Connettori verso gestionali esterni: una riga per connettore, così si
// possono avere due account dello stesso provider. Gli access token stanno
// a parte, in una collection top-level che il client può scrivere ma non
// rileggere: un campo per integrazione, chiamato `<integrationId>Token`.
export const integrationsRepo = {
  ...makeRepo<Integration>('integrations', (a, b) => a.title.localeCompare(b.title)),

  // Elimina il connettore e il suo token nello stesso giro: lasciare un
  // token orfano in un documento illeggibile sarebbe un rifiuto invisibile.
  async removeWithToken(uid: string, id: string): Promise<void> {
    await deleteDoc(doc(db, 'users', uid, 'integrations', id));
    await updateDoc(doc(db, 'integrationSecrets', uid), {
      [`${id}Token`]: deleteField(),
    }).catch(() => {
      // Il documento dei segreti può non esistere (connettore mai
      // collegato): non è un errore, non c'è niente da revocare.
    });
  },

  async setToken(uid: string, integrationId: string, token: string): Promise<void> {
    await setDoc(
      doc(db, 'integrationSecrets', uid),
      { [`${integrationId}Token`]: token, updatedAt: todayIso() },
      { merge: true },
    );
  },
};

export const fiscalYearsRepo = makeRepo<FiscalYear>('fiscalYears', (a, b) => b.year - a.year);

// Newest year first, then brackets bottom-up.
export const taxRatesRepo = makeRepo<TaxRate>(
  'taxRates',
  (a, b) => b.year - a.year || a.fromIncome - b.fromIncome,
);

// Schede dei collaboratori: top-level, chiave = email minuscola. Solo
// l'admin le elenca e le scrive; il collaboratore legge la propria.
export const collaboratorsRepo = {
  async list(): Promise<Collaborator[]> {
    const snap = await getDocs(collection(db, 'collaborators'));
    return snap.docs
      .map((d) => ({ email: d.id, ...d.data() }) as Collaborator)
      .sort((a, b) => a.name.localeCompare(b.name));
  },
  async get(email: string): Promise<Collaborator | null> {
    const snap = await getDoc(doc(db, 'collaborators', email));
    return snap.exists() ? ({ email: snap.id, ...snap.data() } as Collaborator) : null;
  },
  async save(c: Collaborator): Promise<Collaborator> {
    const { email, ...data } = c;
    await setDoc(doc(db, 'collaborators', email), data);
    return c;
  },
  // Elimina la scheda CON le sue ore e le sue attività: senza la scheda
  // resterebbero sottocollezioni orfane che nessuna schermata raggiunge.
  async removeCascade(email: string): Promise<void> {
    const [entries, tasks] = await Promise.all([
      getDocs(collection(db, 'collaborators', email, 'entries')),
      getDocs(collection(db, 'collaborators', email, 'tasks')),
    ]);
    const refs = [...entries.docs, ...tasks.docs].map((d) => d.ref);
    // Un batch regge 500 scritture: uno statino di qualche anno le supera.
    for (let i = 0; i < refs.length; i += 400) {
      const batch = writeBatch(db);
      for (const ref of refs.slice(i, i + 400)) batch.delete(ref);
      await batch.commit();
    }
    await deleteDoc(doc(db, 'collaborators', email));
  },
};

// Riallinea le copie di clienti, contratti e progetti sulle schede dei
// collaboratori dopo una modifica alle anagrafiche (cliente rinominato,
// date di un contratto spostate, progetto aggiunto o disattivato…).
// I collaboratori sono solo dell'admin: per chiunque altro non c'è nulla da
// fare (e le regole negherebbero la lettura). Un errore qui non deve far
// fallire il salvataggio che l'ha innescato: la copia si riallinea alla
// modifica successiva, o riaprendo e salvando la scheda del collaboratore.
export async function syncCollaborators(uid: string): Promise<void> {
  if (firebaseAuth.currentUser?.email?.toLowerCase() !== ADMIN_EMAIL) return;
  try {
    const collaborators = await collaboratorsRepo.list();
    if (!collaborators.length) return;
    const [clients, contracts, projects] = await Promise.all([
      clientsRepo.list(uid),
      contractsRepo.list(uid),
      projectsRepo.list(uid),
    ]);
    for (const c of collaborators) {
      const next = buildCollaboratorClients(grantsOf(c), clients, contracts, projects);
      if (JSON.stringify(next) === JSON.stringify(c.clients)) continue;
      await updateDoc(doc(db, 'collaborators', c.email), { clients: next });
    }
  } catch (err) {
    console.error('Riallineamento dei collaboratori non riuscito', err);
  }
}

export function extractErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
