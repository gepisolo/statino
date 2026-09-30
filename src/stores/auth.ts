import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db, firebaseAuth, signInWithGoogle, signOutFromFirebase } from '@/lib/firebase';
import { ADMIN_EMAIL } from '@/lib/config';

// admin = il proprietario; user = account invitato con un proprio spazio
// completo; collaborator = lavora sui clienti dell'admin e vede solo
// Statino e Attività (scheda in collaborators/{email}).
export type Role = 'admin' | 'user' | 'collaborator';

// Firebase persists the session itself (IndexedDB), so this store only
// mirrors the SDK state; `waitUntilReady` lets the router guard await the
// first onAuthStateChanged emission before deciding where to send the user.
export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const ready = ref(false);
  // null = not checked yet for the current user.
  const allowed = ref<boolean | null>(null);
  const role = ref<Role | null>(null);

  let readyResolve: (() => void) | undefined;
  const readyPromise = new Promise<void>((resolve) => {
    readyResolve = resolve;
  });

  onAuthStateChanged(firebaseAuth, (u) => {
    user.value = u;
    allowed.value = null;
    role.value = null;
    if (!ready.value) {
      ready.value = true;
      readyResolve?.();
    }
  });

  const isAuthenticated = computed(() => user.value !== null);
  const uid = computed(() => user.value?.uid ?? null);
  const email = computed(() => user.value?.email?.toLowerCase() ?? null);
  const isAdmin = computed(() => user.value?.email === ADMIN_EMAIL);
  const isCollaborator = computed(() => role.value === 'collaborator');

  // Mirrors the `isAllowed` function in firestore.rules: the admin always
  // passes, everyone else needs an invite doc in allowedUsers/{email} — or,
  // for a collaborator, an active card in collaborators/{email} (the rules
  // refuse the read when it is suspended, which lands in the catch).
  async function checkAllowed(): Promise<boolean> {
    if (allowed.value !== null) return allowed.value;
    const mail = user.value?.email?.toLowerCase();
    if (!mail) {
      allowed.value = false;
      return false;
    }
    if (mail === ADMIN_EMAIL) {
      role.value = 'admin';
      allowed.value = true;
      return true;
    }
    try {
      if ((await getDoc(doc(db, 'allowedUsers', mail))).exists()) {
        role.value = 'user';
        allowed.value = true;
        return true;
      }
    } catch {
      // fall through to the collaborator check
    }
    try {
      const snap = await getDoc(doc(db, 'collaborators', mail));
      allowed.value = snap.exists();
      if (allowed.value) role.value = 'collaborator';
    } catch {
      allowed.value = false;
    }
    return allowed.value;
  }

  async function loginWithGoogle(): Promise<void> {
    await signInWithGoogle();
  }

  async function logout(): Promise<void> {
    await signOutFromFirebase();
  }

  function waitUntilReady(): Promise<void> {
    return readyPromise;
  }

  return {
    user,
    ready,
    allowed,
    isAuthenticated,
    uid,
    email,
    role,
    isAdmin,
    isCollaborator,
    checkAllowed,
    loginWithGoogle,
    logout,
    waitUntilReady,
  };
});
