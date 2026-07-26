<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import {
  CalendarDays,
  ChartColumnBig,
  Users,
  FileText,
  Receipt,
  Settings,
  LogOut,
  UserPlus,
} from '@lucide/vue';
import type { Component } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { cn } from '@/lib/utils';

const auth = useAuthStore();
const route = useRoute();

interface NavChild {
  name: string;
  label: string;
  to: string;
}
interface NavLink extends NavChild {
  icon: Component;
}
interface NavGroup {
  name: string;
  label: string;
  icon: Component;
  children: NavChild[];
}

const nav = computed<(NavLink | NavGroup)[]>(() => [
  { name: 'statino', label: 'Statino', to: '/', icon: CalendarDays },
  { name: 'clients', label: 'Clienti', to: '/clients', icon: Users },
  { name: 'contracts', label: 'Contratti', to: '/contracts', icon: FileText },
  { name: 'invoices', label: 'Fatture', to: '/invoices', icon: Receipt },
  {
    name: 'stats',
    label: 'Statistiche',
    icon: ChartColumnBig,
    children: [
      { name: 'stats-months', label: 'Per mese', to: '/stats/months' },
      { name: 'stats-clients', label: 'Per cliente', to: '/stats/clients' },
      { name: 'stats-years', label: 'Per anno', to: '/stats/years' },
    ],
  },
  { name: 'settings', label: 'Impostazioni', to: '/settings', icon: Settings },
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
        <template v-for="item in nav" :key="item.name">
          <RouterLink
            v-if="'to' in item"
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
          <div v-else>
            <div
              class="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70"
            >
              <component :is="item.icon" class="size-4" />
              {{ item.label }}
            </div>
            <div class="space-y-0.5">
              <RouterLink
                v-for="child in item.children"
                :key="child.name"
                :to="child.to"
                :class="
                  cn(
                    'flex items-center rounded-md py-1.5 pl-9 pr-3 text-sm transition-colors',
                    activeNav === child.name
                      ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  )
                "
              >
                {{ child.label }}
              </RouterLink>
            </div>
          </div>
        </template>
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
