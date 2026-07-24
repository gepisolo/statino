import { addDoc, collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Client, Contract, Project } from '@/types/models';

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

export function extractErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
