import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  limit,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { todayIso } from '@/lib/format';
import type {
  Client,
  Contract,
  Entry,
  FicConfig,
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

function makeRepo<T extends { id: string }>(name: string, sort: (a: T, b: T) => number) {
  const col = (uid: string) => collection(db, 'users', uid, name);
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
      await setDoc(doc(db, 'users', uid, name, id), data);
      return { id, ...data } as T;
    },
    async remove(uid: string, id: string): Promise<void> {
      await deleteDoc(doc(db, 'users', uid, name, id));
    },
  };
}

export const clientsRepo = {
  ...makeRepo<Client>('clients', (a, b) => a.name.localeCompare(b.name)),
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
  },
};

export const projectsRepo = makeRepo<Project>('projects', (a, b) => a.name.localeCompare(b.name));

// Newest first: recent contracts are the ones being worked against.
export const contractsRepo = makeRepo<Contract>('contracts', (a, b) =>
  b.startDate.localeCompare(a.startDate),
);

// Entries are loaded a calendar year at a time (single-field range query,
// no composite index): the statino view needs the whole year anyway to
// compute per-contract progress against the annual allowance.
export const entriesRepo = {
  ...makeRepo<Entry>('entries', (a, b) => a.date.localeCompare(b.date)),
  async listRange(uid: string, from: string, to: string): Promise<Entry[]> {
    const snap = await getDocs(
      query(
        collection(db, 'users', uid, 'entries'),
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
      query(collection(db, 'users', uid, 'entries'), where('invoiceId', '==', invoiceId)),
    );
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as Entry)
      .sort((a, b) => a.date.localeCompare(b.date));
  },
  // Guard for client deletion: any hour logged for the client, in any
  // year, blocks it.
  async existsForClient(uid: string, clientId: string): Promise<boolean> {
    const snap = await getDocs(
      query(collection(db, 'users', uid, 'entries'), where('clientId', '==', clientId), limit(1)),
    );
    return !snap.empty;
  },
};

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
export const tasksRepo = {
  ...makeRepo<Task>('tasks', (a, b) => a.order - b.order),
  // One-click archiving from the board: only the flag and the position
  // in the archive change — the done outcome (and its doneAt) stay put.
  async archive(uid: string, id: string, order: number): Promise<void> {
    await updateDoc(doc(db, 'users', uid, 'tasks', id), { archived: true, order });
  },
  async reorder(
    uid: string,
    updates: { id: string; order: number; status?: TaskStatus; doneAt?: string | null }[],
  ): Promise<void> {
    const batch = writeBatch(db);
    for (const u of updates) {
      batch.update(doc(db, 'users', uid, 'tasks', u.id), {
        order: u.order,
        ...(u.status !== undefined ? { status: u.status } : {}),
        ...(u.doneAt !== undefined ? { doneAt: u.doneAt } : {}),
      });
    }
    await batch.commit();
  },
};

// Connettori verso gestionali esterni: una riga per connettore, così si
// possono avere due account dello stesso provider. Gli access token stanno
// a parte, in una collection top-level che il client può scrivere ma non
// rileggere: un campo per integrazione, chiamato `<integrationId>Token`.
export const integrationsRepo = {
  ...makeRepo<Integration>('integrations', (a, b) => a.title.localeCompare(b.title)),

  async list(uid: string): Promise<Integration[]> {
    const snap = await getDocs(collection(db, 'users', uid, 'integrations'));
    const out: Integration[] = [];
    for (const d of snap.docs) {
      const data = d.data();
      if (data.type) {
        out.push({ id: d.id, ...data } as Integration);
        continue;
      }
      // MIGRAZIONE ONE-SHOT (v0.34.0) — eliminabile una volta girata.
      // Prima esisteva un solo connettore, in un documento a id fisso
      // `fattureincloud` con i campi della config a livello superiore. Ora
      // sono righe tipizzate con la config annidata. Il token non si tocca:
      // il vecchio campo `fattureincloudToken` combacia già con la
      // convenzione `<integrationId>Token`, visto che l'id del documento
      // diventa l'id dell'integrazione.
      const migrated = {
        type: 'fatturazione' as const,
        provider: 'fattureincloud' as const,
        title: (data.companyName as string) || 'Fatture in Cloud',
        config: data as unknown as FicConfig,
      };
      await setDoc(d.ref, migrated);
      out.push({ id: d.id, ...migrated });
    }
    return out.sort((a, b) => a.title.localeCompare(b.title));
  },

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

export function extractErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
