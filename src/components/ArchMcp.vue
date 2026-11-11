<script setup lang="ts">
import { computed, ref } from 'vue';
import { useProject } from '../composables/useProject';

const { data } = useProject();
const server = ref('all');

const calls = computed(() => data.value?.mcp ?? []);
const servers = computed(() => ['all', ...new Set(calls.value.map((c) => c.server))]);
const shown = computed(() => calls.value.filter((c) => server.value === 'all' || c.server === server.value));
const resCls = (r: string) => (r === 'OK' ? 'ok' : r === 'Refusé' ? 'fail' : 'hint');
</script>

<template>
  <div class="page">
    <div class="stack">
      <div class="intro">
        <strong>Journal des serveurs MCP</strong>
        <span class="sub">Ce que chaque serveur a réellement fait pendant les sessions, avec le nœud qui l'a demandé.</span>
      </div>
      <div v-if="calls.length" class="chips" role="group" aria-label="Serveur">
        <button v-for="s in servers" :key="s" class="seg" :class="{ sel: server === s }" :aria-pressed="server === s" @click="server = s">{{ s === 'all' ? 'Tous' : s }}</button>
      </div>
      <div v-else class="card pad empty-msg">Aucun appel enregistré : <span class="mono">logs/mcp.md</span> n'existe pas encore.</div>
      <div class="rows">
        <div v-for="(r, i) in shown" :key="i" class="card row">
          <span class="mono time">{{ r.time }}</span>
          <span class="tag blue">{{ r.server }}</span>
          <span class="act">{{ r.action }}</span>
          <span class="small">{{ r.node }} · {{ r.project }}</span>
          <span class="tag" :class="r.kind === 'écriture' ? 'hint' : ''">{{ r.kind }}</span>
          <span class="tag" :class="resCls(r.result)">{{ r.result }}</span>
        </div>
      </div>
      <span v-if="calls.length" class="small">{{ shown.length }} appels affichés. Les écritures en production passent toujours par un point d'arrêt « Ta validation ».</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
:where(button:not(.btn, .chipb)) { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; text-align: left; padding: 0; }
.page { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 20px 24px 24px; }
.stack { max-width: 960px; display: flex; flex-direction: column; gap: 16px; }
.intro { display: flex; flex-direction: column; gap: 2px; strong { font-size: 16px; } }
.sub { font-size: 13px; color: var(--muted-2); }
.small:not(.btn) { font-size: 12px; color: var(--muted-2); }
.pad { padding: 16px; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; }
.seg { height: 40px; padding: 0 12px; display: flex; align-items: center; font-size: 13px; color: var(--muted-2); border-radius: 8px; border: 1px solid #34343b; &:hover { color: var(--text); } &.sel { background: #2e2e34; color: var(--text); border-color: #4a4a53; } }
.rows { display: flex; flex-direction: column; gap: 6px; }
.row { flex-direction: row; flex-wrap: wrap; align-items: center; gap: 6px 12px; padding: 10px 14px; }
.time { font-size: 12px; color: var(--muted); min-width: 48px; }
.act { flex: 1 1 260px; font-size: 13px; }
.empty-msg { display: block; color: var(--muted-2); font-size: 13px; }
</style>
