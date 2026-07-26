import { createRouter, createWebHistory } from 'vue-router';
import AppShell from '@/components/layout/AppShell.vue';
import { installAuthGuard } from './guards';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      meta: { public: true },
      component: () => import('@/views/auth/LoginView.vue'),
    },
    {
      path: '/unauthorized',
      name: 'unauthorized',
      component: () => import('@/views/auth/UnauthorizedView.vue'),
    },
    {
      path: '/',
      component: AppShell,
      children: [
        {
          path: '',
          name: 'statino',
          component: () => import('@/views/statino/StatinoView.vue'),
        },
        {
          path: 'clients',
          name: 'clients',
          component: () => import('@/views/clients/ClientsView.vue'),
        },
        {
          path: 'clients/:clientId/projects',
          name: 'client-projects',
          // Highlight "Clienti" in the sidebar: projects are reached from there.
          meta: { nav: 'clients' },
          component: () => import('@/views/projects/ProjectsView.vue'),
          props: true,
        },
        {
          path: 'contracts',
          name: 'contracts',
          component: () => import('@/views/contracts/ContractsView.vue'),
        },
        {
          path: 'invoices',
          name: 'invoices',
          component: () => import('@/views/invoices/InvoicesView.vue'),
        },
        {
          path: 'stats/months',
          name: 'stats-months',
          component: () => import('@/views/stats/StatsMonthsView.vue'),
        },
        {
          path: 'stats/clients',
          name: 'stats-clients',
          component: () => import('@/views/stats/StatsClientsView.vue'),
        },
        {
          path: 'stats/years',
          name: 'stats-years',
          component: () => import('@/views/stats/StatsYearsView.vue'),
        },
        {
          path: 'settings',
          name: 'settings',
          component: () => import('@/views/settings/SettingsView.vue'),
        },
        {
          path: 'users',
          name: 'users',
          meta: { admin: true },
          component: () => import('@/views/administration/UsersView.vue'),
        },
      ],
    },
  ],
});

installAuthGuard(router);
