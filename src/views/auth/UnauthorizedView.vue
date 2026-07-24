<script setup lang="ts">
import { useRouter } from 'vue-router';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();

async function onLogout() {
  await auth.logout();
  await router.replace('/login');
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-background">
    <div
      class="w-full max-w-sm rounded-xl border bg-card p-8 text-center text-card-foreground shadow-sm"
    >
      <h1 class="mb-2 text-2xl font-semibold tracking-tight">Account non abilitato</h1>
      <p class="mb-6 text-sm text-muted-foreground">
        L'account <span class="font-medium">{{ auth.user?.email }}</span> non è abilitato all'uso di
        Statino. Chiedi al proprietario di invitarti.
      </p>
      <Button class="w-full" @click="onLogout">Esci</Button>
    </div>
  </div>
</template>
