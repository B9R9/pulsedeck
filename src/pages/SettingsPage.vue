<template>
  <q-page class="page">
    <div class="wrap">
      <h1>Options</h1>

      <section class="card">
        <span class="h">Projet de travail</span>
        <div class="line">
          <div class="info">
            <span class="label">Dossier du projet</span>
            <span class="val mono">{{ s?.root || 'Aucun dossier choisi' }}</span>
            <span class="hint">Contient les cycles, feats, pulses, documents, sessions et le dossier links.</span>
          </div>
          <button type="button" class="btn" @click="changeRoot">Changer</button>
        </div>
        <div v-if="(s?.projects?.length ?? 0) > 1" class="line">
          <div class="info">
            <span class="label">Projets déjà ouverts</span>
            <span class="hint">Un clic bascule le travail vers ce dossier.</span>
          </div>
          <div class="choices">
            <button v-for="p in s?.projects ?? []" :key="p" type="button" class="switch" :class="{ on: p === s?.root }" @click="changeProject(p)">{{ baseName(p) }}</button>
          </div>
        </div>
      </section>

      <section class="card">
        <span class="h">Tickets Jira</span>
        <div class="line">
          <div class="info">
            <span class="label">Fichier lu <span class="tag" :class="originCls">{{ originLabel }}</span></span>
            <span class="val mono">{{ s?.ticketsFile || 'Aucun fichier trouvé' }}</span>
            <span class="hint">Sans choix, chaque projet a son fichier : &lt;dossier du projet&gt;/Tickets/&lt;nom du projet&gt;.csv, créé au premier lancement (l'ancien jira-tickets.json sert à l'amorcer). Le CSV s'ouvre et se modifie dans Google Sheets ; les changements hors de l'app sont repris automatiquement. Si un jour tu synchronises ce dossier avec Drive pour ordinateur, la connexion Drive se fait sans changer de code.</span>
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
            <span class="hint">Pour les sessions libres et l'aide de l'IA (découpage d'une feat, mise à jour d'un document). Les agents d'un workflow gardent leur propre modèle. Les modèles « (local) » viennent d'Ollama.</span>
          </div>
          <div class="choices">
            <button v-for="m in models" :key="m.value" type="button" class="switch" :class="{ on: s?.model === m.value }" @click="setModel(m.value)">{{ m.label }}</button>
          </div>
        </div>
        <div class="line">
          <div class="info">
            <span class="label">Modèle des actions de la page Projet</span>
            <span class="hint">Découpage d'une feat et suggestions dans les cycles, feats, pulses et tickets.</span>
          </div>
          <div class="choices">
            <button v-for="m in models" :key="'projets-' + m.value" type="button" class="switch" :class="{ on: s?.modelProjets === m.value }" @click="setModelProjets(m.value)">{{ m.label }}</button>
          </div>
        </div>
        <div class="line">
          <div class="info">
            <span class="label">Modèle des actions de la page Documentation</span>
            <span class="hint">Proposition de mise à jour d'un document et suggestions.</span>
          </div>
          <div class="choices">
            <button v-for="m in models" :key="'docs-' + m.value" type="button" class="switch" :class="{ on: s?.modelDocs === m.value }" @click="setModelDocs(m.value)">{{ m.label }}</button>
          </div>
        </div>
      </section>

      <section class="card">
        <span class="h">Modèles locaux (Ollama)</span>
        <p v-if="!s?.localModels?.length" class="hint empty">Ollama ne répond pas sur localhost:11434. Lance-le puis reviens ici : les modèles installés apparaîtront.</p>
        <div v-for="m in s?.localModels ?? []" :key="m.id" class="line lm">
          <div class="info">
            <input class="lmname" :value="m.label" :aria-label="'Nom affiché de ' + m.id" @change="renameLocal(m.id, $event)" />
            <span class="hint val">{{ m.id }}</span>
          </div>
          <button type="button" class="switch" :class="{ on: m.on }" @click="toggleLocal(m.id)">{{ m.on ? 'Utilisé' : 'Ignoré' }}</button>
        </div>
        <span class="hint">Le nom affiché remplace l'identifiant long d'Ollama dans toutes les listes de modèles. Décoche ce que tu ne veux pas proposer (embeddings, essais).</span>
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
import type { AppSettings, LocalModel } from '../shared/types';
import { useProject } from '../composables/useProject';
import { useTickets } from '../composables/useTickets';

const s = ref<AppSettings | null>(null);
const error = ref('');
const { choose, reload, setWorkspace } = useProject();
const { chooseFile, reload: reloadTickets } = useTickets();

const models = computed(() => [
  { value: '', label: 'Défaut de Claude Code' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'opus', label: 'Opus' },
  { value: 'haiku', label: 'Haiku' },
  ...(s.value?.localModels ?? []).filter((m) => m.on).map((m) => ({ value: m.id, label: m.label }))
]);

const baseName = (p: string) => p.split('/').pop() || p;

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
const changeProject = (p: string) => run(async () => {
  await setWorkspace(p);
  await reloadTickets();
});
const pickTickets = () => run(() => chooseFile());
const autoTickets = () => run(async () => { s.value = await window.api.setSettings({ ticketsFile: '' }); await reloadTickets(); });
const setModel = (value: string) => run(async () => { s.value = await window.api.setSettings({ model: value }); });
const setModelProjets = (value: string) => run(async () => { s.value = await window.api.setSettings({ modelProjets: value }); });
const setModelDocs = (value: string) => run(async () => { s.value = await window.api.setSettings({ modelDocs: value }); });
const saveLocal = (id: string, patch: Partial<LocalModel>) => run(async () => {
  // Objets purs uniquement : les proxys Vue ne traversent pas l'IPC (« An object could not be cloned »).
  const next = (s.value?.localModels ?? []).map((m) => ({ id: m.id, label: m.label, on: m.on }))
    .map((m) => (m.id === id ? { ...m, ...patch } : m));
  s.value = await window.api.setSettings({ localModels: next });
});
const toggleLocal = (id: string) => saveLocal(id, { on: !(s.value?.localModels ?? []).find((m) => m.id === id)?.on });
const renameLocal = (id: string, e: Event) => saveLocal(id, { label: ((e.target as HTMLInputElement).value || '').trim() || id });

onMounted(() => {
  void refresh();
});
</script>

<style scoped lang="scss">
.page { height: calc(100vh - 56px); overflow: auto; }
.wrap { max-width: 820px; margin: 0 auto; padding: 28px 24px 48px; display: flex; flex-direction: column; gap: 16px; h1 { font-size: 20px; font-weight: 600; margin: 0 0 4px; } }
.line { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.info { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1 1 320px; }
.label { font-size: 14px; display: flex; align-items: center; gap: 8px; }
.val { font-size: 12px; color: var(--blue); overflow-wrap: anywhere; }
.hint { font-size: 12px; color: var(--muted-2); }
.empty { margin: 4px 0 0; }
.lm { .info { flex: 1 1 320px; } }
.lmname { width: 100%; max-width: 320px; background: none; border: none; border-bottom: 1px solid var(--line-2); color: var(--text); font-size: 14px; padding: 2px 0; &:focus { outline: none; border-bottom-color: var(--blue); } }
.choices { display: flex; flex-wrap: wrap; gap: 6px; }
.kv { display: flex; gap: 16px; font-size: 13px; > span:first-child { flex: 0 0 150px; color: var(--muted-2); } > span:last-child { overflow-wrap: anywhere; } }
</style>
