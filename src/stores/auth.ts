import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { firebaseAuth, signInWithGoogle, signOutFromFirebase } from '@/lib/firebase';

// Firebase persists the session itself (IndexedDB), so this store only
// mirrors the SDK state; `waitUntilReady` lets the router guard await the
// first onAuthStateChanged emission before deciding where to send the user.
export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const ready = ref(false);

  let readyResolve: (() => void) | undefined;
  const readyPromise = new Promise<void>((resolve) => {
    readyResolve = resolve;
  });

  onAuthStateChanged(firebaseAuth, (u) => {
    user.value = u;
    if (!ready.value) {
      ready.value = true;
      readyResolve?.();
    }
  });

  const isAuthenticated = computed(() => user.value !== null);
  const uid = computed(() => user.value?.uid ?? null);

  async function loginWithGoogle(): Promise<void> {
    await signInWithGoogle();
  }

  async function logout(): Promise<void> {
    await signOutFromFirebase();
  }

  function waitUntilReady(): Promise<void> {
    return readyPromise;
  }

  return { user, ready, isAuthenticated, uid, loginWithGoogle, logout, waitUntilReady };
});
