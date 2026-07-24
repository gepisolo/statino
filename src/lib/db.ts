import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Client, Contract, Entry, Invoice, Project } from '@/types/models';

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

export const clientsRepo = makeRepo<Client>('clients', (a, b) => a.name.localeCompare(b.name));

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
};

// Creating an invoice locks the billed entries (sets their `invoiceId`);
// deleting it unlocks them. Both run in a single atomic batch.
export const invoicesRepo = {
  ...makeRepo<Invoice>('invoices', (a, b) => b.dateFrom.localeCompare(a.dateFrom)),
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

export function extractErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
