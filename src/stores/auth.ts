import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db, firebaseAuth, signInWithGoogle, signOutFromFirebase } from '@/lib/firebase';
import { ADMIN_EMAIL } from '@/lib/config';

// Firebase persists the session itself (IndexedDB), so this store only
// mirrors the SDK state; `waitUntilReady` lets the router guard await the
// first onAuthStateChanged emission before deciding where to send the user.
export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const ready = ref(false);
  // null = not checked yet for the current user.
  const allowed = ref<boolean | null>(null);

  let readyResolve: (() => void) | undefined;
  const readyPromise = new Promise<void>((resolve) => {
    readyResolve = resolve;
  });

  onAuthStateChanged(firebaseAuth, (u) => {
    user.value = u;
    allowed.value = null;
    if (!ready.value) {
      ready.value = true;
      readyResolve?.();
    }
  });

  const isAuthenticated = computed(() => user.value !== null);
  const uid = computed(() => user.value?.uid ?? null);
  const isAdmin = computed(() => user.value?.email === ADMIN_EMAIL);

  // Mirrors the `isAllowed` function in firestore.rules: the admin always
  // passes, everyone else needs an invite doc in allowedUsers/{email}.
  async function checkAllowed(): Promise<boolean> {
    if (allowed.value !== null) return allowed.value;
    const email = user.value?.email?.toLowerCase();
    if (!email) {
      allowed.value = false;
      return false;
    }
    if (email === ADMIN_EMAIL) {
      allowed.value = true;
      return true;
    }
    try {
      const snap = await getDoc(doc(db, 'allowedUsers', email));
      allowed.value = snap.exists();
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
    isAdmin,
    checkAllowed,
    loginWithGoogle,
    logout,
    waitUntilReady,
  };
});
