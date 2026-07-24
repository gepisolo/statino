<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import { CalendarDays, Users, FileText, Receipt, LogOut, UserPlus } from '@lucide/vue';
import { useAuthStore } from '@/stores/auth';
import { cn } from '@/lib/utils';

const auth = useAuthStore();
const route = useRoute();

const nav = computed(() => [
  { name: 'statino', label: 'Statino', to: '/', icon: CalendarDays },
  { name: 'clients', label: 'Clienti', to: '/clients', icon: Users },
  { name: 'contracts', label: 'Contratti', to: '/contracts', icon: FileText },
  { name: 'invoices', label: 'Fatture', to: '/invoices', icon: Receipt },
  ...(auth.isAdmin ? [{ name: 'users', label: 'Utenti', to: '/users', icon: UserPlus }] : []),
]);

// Routes reached from a nav section (e.g. a client's projects) set
// meta.nav to keep that section highlighted.
const activeNav = computed(() => (route.meta.nav as string | undefined) ?? route.name);

const appEnv = import.meta.env.VITE_APP_ENV || 'production';
const appVersion = __APP_VERSION__;

async function onLogout() {
  await auth.logout();
  window.location.href = '/login';
}
</script>

<template>
  <div class="flex min-h-screen bg-background text-foreground">
    <aside class="flex w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div class="px-4 py-5">
        <span class="text-lg font-semibold tracking-tight">Statino</span>
      </div>
      <nav class="flex-1 space-y-1 px-2">
        <RouterLink
          v-for="item in nav"
          :key="item.name"
          :to="item.to"
          :class="
            cn(
              'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              activeNav === item.name
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
            )
          "
        >
          <component :is="item.icon" class="size-4" />
          {{ item.label }}
        </RouterLink>
      </nav>
      <div class="border-t border-sidebar-border p-3">
        <div class="mb-2 truncate px-1 text-xs text-muted-foreground">
          {{ auth.user?.email }}
        </div>
        <button
          class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          @click="onLogout"
        >
          <LogOut class="size-4" />
          Esci
        </button>
        <div class="mt-2 px-1 text-[10px] text-muted-foreground">
          v{{ appVersion }} · {{ appEnv }}
        </div>
      </div>
    </aside>
    <main class="flex-1 overflow-x-hidden p-6">
      <RouterView />
    </main>
  </div>
</template>
