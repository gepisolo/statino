<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import {
  CalendarDays,
  ChartColumnBig,
  Users,
  FileText,
  Receipt,
  Settings,
  LogOut,
  Menu,
  UserPlus,
  X,
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

// Below md the sidebar becomes an overlay drawer opened from the top bar.
const drawerOpen = ref(false);

watch(
  () => route.fullPath,
  () => {
    drawerOpen.value = false;
  },
);

watch(drawerOpen, (open) => {
  document.body.style.overflow = open ? 'hidden' : '';
});

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') drawerOpen.value = false;
}
watch(drawerOpen, (open) => {
  if (open) {
    window.addEventListener('keydown', onKeydown);
  } else {
    window.removeEventListener('keydown', onKeydown);
  }
});
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
  document.body.style.overflow = '';
});

async function onLogout() {
  await auth.logout();
  window.location.href = '/login';
}
</script>

<template>
  <div class="min-h-screen bg-background text-foreground md:flex">
    <header
      class="sticky top-0 z-30 flex items-center gap-1 border-b border-border bg-background/95 px-2 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur md:hidden"
    >
      <button
        class="flex size-11 items-center justify-center rounded-md text-foreground/70 transition-colors hover:bg-secondary hover:text-foreground"
        aria-label="Apri il menu"
        :aria-expanded="drawerOpen"
        @click="drawerOpen = true"
      >
        <Menu class="size-5" />
      </button>
      <span class="text-lg font-semibold tracking-tight">Statino</span>
    </header>

    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-200"
      leave-to-class="opacity-0"
    >
      <div
        v-if="drawerOpen"
        class="fixed inset-0 z-40 bg-black/50 md:hidden"
        aria-hidden="true"
        @click="drawerOpen = false"
      />
    </Transition>

    <aside
      :class="
        cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 -translate-x-full flex-col border-r border-sidebar-border bg-sidebar transition-transform duration-200 ease-out',
          'md:static md:z-auto md:w-56 md:translate-x-0 md:transition-none',
          drawerOpen && 'translate-x-0',
        )
      "
    >
      <div
        class="flex items-center justify-between px-4 pb-5 pt-[max(1.25rem,env(safe-area-inset-top))]"
      >
        <span class="text-lg font-semibold tracking-tight">Statino</span>
        <button
          class="-mr-2 flex size-11 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground md:hidden"
          aria-label="Chiudi il menu"
          @click="drawerOpen = false"
        >
          <X class="size-5" />
        </button>
      </div>
      <nav class="flex-1 space-y-1 overflow-y-auto px-2">
        <template v-for="item in nav" :key="item.name">
          <RouterLink
            v-if="'to' in item"
            :to="item.to"
            :class="
              cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors pointer-coarse:py-2.5',
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
                    'flex items-center rounded-md py-1.5 pl-9 pr-3 text-sm transition-colors pointer-coarse:py-2.5',
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
      <div class="border-t border-sidebar-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div class="mb-2 truncate px-1 text-xs text-muted-foreground">
          {{ auth.user?.email }}
        </div>
        <button
          class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground pointer-coarse:py-2.5"
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

    <main class="min-w-0 flex-1 overflow-x-hidden p-4 sm:p-6">
      <RouterView />
    </main>
  </div>
</template>
