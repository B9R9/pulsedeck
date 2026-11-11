<template>
  <q-layout view="hHh lpR fFf">
    <q-header class="bar">
      <nav class="modes" aria-label="Modes">
        <router-link v-for="m in modes" :key="m.to" :to="m.to" class="mode" active-class="" exact-active-class="sel">
          {{ m.label }}
          <span v-if="m.badge && waiting > 0" class="badge">{{ waiting }}</span>
        </router-link>
      </nav>
      <span class="root mono">{{ rootLabel }}</span>
    </q-header>
    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useProject } from '../composables/useProject';

const { data, waiting } = useProject();

const modes = [
  { to: '/', label: 'Développement' },
  { to: '/architecture', label: 'Architecture' },
  { to: '/projet', label: 'Projet' },
  { to: '/documentation', label: 'Documentation' },
  { to: '/stats', label: 'Stats' },
  { to: '/a-traiter', label: 'À traiter', badge: true },
  { to: '/options', label: 'Options' }
];

const rootLabel = computed(() => data.value?.root || 'Aucun dossier de projet');
</script>

<style scoped lang="scss">
.bar {
  background: var(--panel); border-bottom: 1px solid var(--line); color: var(--text);
  min-height: 56px; display: flex; align-items: center; gap: 16px; padding: 6px 16px 6px 84px;
  -webkit-app-region: drag;
}
.modes { display: flex; gap: 4px; -webkit-app-region: no-drag; }
.mode {
  height: 44px; padding: 0 16px; display: flex; align-items: center; gap: 8px; border-radius: 8px;
  font-size: 14px; color: var(--muted-2); text-decoration: none;
  &:hover { color: var(--text); }
  &.sel { background: #2e2e34; color: var(--text); }
}
.badge {
  min-width: 20px; height: 20px; box-sizing: border-box; padding: 0 6px; border-radius: 999px;
  background: var(--clay); color: #1a1210; font-size: 12px; font-weight: 600;
  display: inline-flex; align-items: center; justify-content: center;
}
.root { margin-left: auto; font-size: 12px; color: var(--muted); }
</style>
