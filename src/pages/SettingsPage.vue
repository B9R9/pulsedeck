<template>
  <q-page class="page">
    <div class="wrap">
      <h1>Options</h1>

      <section class="card">
        <span class="h">Projet</span>
        <div class="line">
          <div class="info">
            <span class="label">Dossier du projet</span>
            <span class="val mono">{{ s?.root || 'Aucun dossier choisi' }}</span>
            <span class="hint">Contient les cycles, feats, pulses, documents, sessions et le dossier links.</span>
          </div>
          <button type="button" class="btn" @click="changeRoot">Changer</button>
        </div>
      </section>

      <section class="card">
        <span class="h">Tickets Jira</span>
        <div class="line">
          <div class="info">
            <span class="label">Fichier lu <span class="tag" :class="originCls">{{ originLabel }}</span></span>
            <span class="val mono">{{ s?.ticketsFile || 'Aucun fichier trouvé' }}</span>
            <span class="hint">Sans choix, l'app cherche jira-tickets.json dans Google Drive pour ordinateur, puis dans le dossier du projet.</span>
          </div>
          <div class="row-actions">
            <button type="button" class="btn" @click="pickTickets">Choisir un fichier</button>
            <button type="button" class="btn" :disabled="!s?.ticketsChosen" @click="autoTickets">Détection automatique</button>
          </div>
        </div>
      </section>

      <section class="card">
        <span class="h">Claude</span>
        <div class="line">
          <div class="info">
            <span class="label">Modèle par défaut</span>
            <span class="hint">Pour les sessions libres et l'aide de l'IA (découpage d'une feat, mise à jour d'un document). Les agents d'un workflow gardent leur propre modèle.</span>
          </div>
          <div class="choices">
            <button v-for="m in models" :key="m.value" type="button" class="switch" :class="{ on: s?.model === m.value }" @click="setModel(m.value)">{{ m.label }}</button>
          </div>
        </div>
      </section>

      <section class="card">
        <span class="h">À propos</span>
        <div class="kv"><span>Version</span><span class="mono">{{ s?.version || '' }}</span></div>
        <div class="kv"><span>Données de l'app</span><span class="mono">{{ s?.dataDir || '' }}</span></div>
      </section>

      <p v-if="error" class="banner fail">{{ error }}</p>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { AppSettings } from '../shared/types';
import { useProject } from '../composables/useProject';
import { useTickets } from '../composables/useTickets';

const s = ref<AppSettings | null>(null);
const error = ref('');
const { choose, reload } = useProject();
const { chooseFile, reload: reloadTickets } = useTickets();

const models = [
  { value: '', label: 'Défaut de Claude Code' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'opus', label: 'Opus' },
  { value: 'haiku', label: 'Haiku' }
];

const originLabel = computed(() => ({ choisi: 'Choisi', drive: 'Google Drive', projet: 'Copie du projet', aucun: 'Introuvable' })[s.value?.ticketsOrigin ?? 'aucun']);
const originCls = computed(() => (s.value?.ticketsOrigin === 'aucun' ? 'fail' : s.value?.ticketsOrigin === 'drive' ? 'ok' : 'blue'));

async function refresh() {
  try {
    s.value = await window.api.loadSettings();
    error.value = '';
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}
async function run(fn: () => Promise<unknown>) {
  try {
    await fn();
    await refresh();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}

const changeRoot = () => run(async () => { await choose(); await reload(); await reloadTickets(); });
const pickTickets = () => run(() => chooseFile());
const autoTickets = () => run(async () => { s.value = await window.api.setSettings({ ticketsFile: '' }); await reloadTickets(); });
const setModel = (value: string) => run(async () => { s.value = await window.api.setSettings({ model: value }); });

onMounted(refresh);
</script>

<style scoped lang="scss">
.page { height: calc(100vh - 56px); overflow: auto; }
.wrap { max-width: 820px; margin: 0 auto; padding: 28px 24px 48px; display: flex; flex-direction: column; gap: 16px; h1 { font-size: 20px; font-weight: 600; margin: 0 0 4px; } }
.line { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.info { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1 1 320px; }
.label { font-size: 14px; display: flex; align-items: center; gap: 8px; }
.val { font-size: 12px; color: var(--blue); overflow-wrap: anywhere; }
.hint { font-size: 12px; color: var(--muted-2); }
.choices { display: flex; flex-wrap: wrap; gap: 6px; }
.kv { display: flex; gap: 16px; font-size: 13px; > span:first-child { flex: 0 0 150px; color: var(--muted-2); } > span:last-child { overflow-wrap: anywhere; } }
</style>
