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
          path: 'projects',
          name: 'projects',
          component: () => import('@/views/projects/ProjectsView.vue'),
        },
        {
          path: 'contracts',
          name: 'contracts',
          component: () => import('@/views/contracts/ContractsView.vue'),
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
