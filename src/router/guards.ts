import type { Router } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

export function installAuthGuard(router: Router): void {
  router.beforeEach(async (to) => {
    const auth = useAuthStore();
    await auth.waitUntilReady();

    if (to.meta.public) {
      if (to.name === 'login' && auth.isAuthenticated) {
        return { path: '/' };
      }
      return true;
    }

    if (!auth.isAuthenticated) {
      return { name: 'login', query: { redirect: to.fullPath } };
    }
    return true;
  });
}
