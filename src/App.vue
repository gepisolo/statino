<script setup lang="ts">
import { Toaster, toast } from 'vue-sonner';
import 'vue-sonner/style.css';

function dismissClickedToast(event: MouseEvent) {
  const target = event.target as HTMLElement;
  // non intercettare i click su azioni, close button o link dentro al toast
  if (target.closest('button, a')) return;
  const toastEl = target.closest<HTMLElement>('[data-sonner-toast]');
  if (!toastEl || toastEl.dataset.dismissible === 'false') return;
  // data-index 0 è il toast più recente; getToasts() è ordinato dal più vecchio
  const active = toast.getToasts();
  const clicked = active[active.length - 1 - Number(toastEl.dataset.index)];
  if (clicked) toast.dismiss(clicked.id);
}
</script>

<template>
  <RouterView />
  <div @click="dismissClickedToast">
    <Toaster rich-colors position="top-right" />
  </div>
</template>

<style>
[data-sonner-toast] {
  cursor: pointer;
}
</style>
