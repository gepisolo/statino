import {
  addDoc,
  collection,
  deleteDoc,
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
import type {
  Client,
  Contract,
  Entry,
  FiscalYear,
  Invoice,
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
  async reorder(
    uid: string,
    updates: { id: string; order: number; status?: TaskStatus }[],
  ): Promise<void> {
    const batch = writeBatch(db);
    for (const u of updates) {
      batch.update(
        doc(db, 'users', uid, 'tasks', u.id),
        u.status ? { order: u.order, status: u.status } : { order: u.order },
      );
    }
    await batch.commit();
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
