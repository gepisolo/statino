<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { toast } from 'vue-sonner';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const submitting = ref(false);

async function onGoogleLogin() {
  submitting.value = true;
  try {
    await auth.loginWithGoogle();
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/';
    await router.replace(redirect);
  } catch (err) {
    toast.error('Accesso non riuscito', {
      description: err instanceof Error ? err.message : String(err),
    });
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-background">
    <div class="w-full max-w-sm rounded-xl border bg-card p-8 text-card-foreground shadow-sm">
      <h1 class="mb-1 text-center text-2xl font-semibold tracking-tight">Statino</h1>
      <p class="mb-6 text-center text-sm text-muted-foreground">Consuntivazione ore per cliente</p>
      <button
        class="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        :disabled="submitting"
        @click="onGoogleLogin"
      >
        Accedi con Google
      </button>
    </div>
  </div>
</template>
