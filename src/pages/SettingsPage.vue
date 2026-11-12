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
        <span class="h">Formats de sortie</span>
        <p class="hint">
          Décide comment Claude rédige tes notes de session, tes documents et ses réponses : pars d'un modèle prêt à l'emploi ou écris tes attentes.
          Le format par défaut de chaque type est appliqué automatiquement à la génération.
        </p>
        <div class="choices">
          <button v-for="k in FORMAT_KINDS" :key="k" type="button" class="switch" :class="{ on: tab === k }" @click="openTab(k)">{{ KIND_LABEL[k] }}</button>
        </div>

        <div v-for="f in formatsOf" :key="f.id" class="line">
          <div class="info">
            <span class="label">{{ f.label }} <span v-if="defautOf(tab) === f.id" class="tag ok">Par défaut</span></span>
            <span class="hint clamp">{{ f.text }}</span>
          </div>
          <div class="row-actions">
            <button type="button" class="btn" @click="openEditor(f)">Modifier</button>
            <button type="button" class="btn" :disabled="defautOf(tab) === f.id" @click="applyDefaut(f.id)">Défaut</button>
            <button type="button" class="ic" aria-label="Supprimer le format" @click="removeFormat(f.id)">✕</button>
          </div>
        </div>
        <p v-if="!formatsOf.length" class="hint empty">Aucun format pour ce type : Claude suit sa structure habituelle.</p>

        <div v-if="draft" class="editor">
          <input v-model="draft.label" aria-label="Nom du format" placeholder="Nom du format" />
          <textarea v-model="draft.text" aria-label="Consigne du format" rows="5"
            placeholder="Décris la structure attendue : sections, ton, longueur. Claude lit cette consigne à chaque génération." />
          <div class="choices">
            <span class="hint">Partir d'un modèle :</span>
            <button v-for="p in KIND_PRESETS[tab]" :key="p.label" type="button" class="switch" @click="applyPreset(p.text)">{{ p.label }}</button>
          </div>
          <div class="row-actions">
            <button type="button" class="btn" :disabled="!draft.label.trim() || !draft.text.trim()" @click="saveDraft">Enregistrer</button>
            <button type="button" class="btn" @click="draft = null">Annuler</button>
          </div>
        </div>
        <button v-else type="button" class="btn" @click="openNew">Nouveau format</button>
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
import type { AppSettings, FormatKind, LocalModel, OutputFormat } from '../shared/types';
import { useProject } from '../composables/useProject';
import { useTickets } from '../composables/useTickets';
import { useSettings } from '../composables/useSettings';

const FORMAT_KINDS: FormatKind[] = ['recap', 'document', 'reponse'];
const KIND_LABEL: Record<FormatKind, string> = { recap: 'Récaps de session', document: 'Documents', reponse: 'Réponses' };

/** Modèles prêts à l'emploi : ils remplissent la consigne, que l'utilisateur peut ensuite ajuster. */
const KIND_PRESETS: Record<FormatKind, { label: string; text: string }[]> = {
  recap: [
    { label: 'Récap standard', text: 'Structure la note de session ainsi : Objectif (une phrase), Ce qui a été fait (liste courte), Décisions (liste, écris aucune si vide), Fichiers touchés (chemins), À suivre (prochaines étapes), puis le coût et la durée.' },
    { label: 'Points clés', text: 'Rends la note de session en 3 à 5 puces au maximum : ce qui a été fait, les décisions prises et la prochaine étape. Pas de détails de mise en œuvre.' },
    { label: 'Journal', text: 'Rends la note de session sous forme de journal chronologique : une ligne par étape marquante, dans l\'ordre, avec son résultat.' }
  ],
  document: [
    { label: 'Fiche', text: 'Structure le document ainsi : Objet (une phrase), Contexte, Détails (sections courtes), Liens (cycles, feats, pulses, tickets concernés).' },
    { label: 'Procédure', text: 'Structure le document ainsi : Prérequis, Étapes numérotées avec les commandes exactes, Vérification, Retour arrière. Chaque étape doit pouvoir être suivie sans autre document.' },
    { label: 'Compte rendu', text: 'Structure le document ainsi : Participants, Décisions prises, Actions à mener avec porteur et échéance, Points ouverts.' }
  ],
  reponse: [
    { label: 'Réponse courte', text: 'Réponds en 3 phrases au maximum, puis au besoin une puce par point d\'attention. Va droit au résultat.' },
    { label: 'Analyse', text: 'Structure la réponse ainsi : Contexte (2 phrases), Analyse, Recommandation, Risques. Reste factuel et cite les fichiers concernés.' }
  ]
};

const { settings: s, loadSettings, updateSettings } = useSettings();
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
    await loadSettings();
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
const autoTickets = () => run(async () => { await updateSettings({ ticketsFile: '' }); await reloadTickets(); });
const setModel = (value: string) => run(async () => { await updateSettings({ model: value }); });
const setModelProjets = (value: string) => run(async () => { await updateSettings({ modelProjets: value }); });
const setModelDocs = (value: string) => run(async () => { await updateSettings({ modelDocs: value }); });
const saveLocal = (id: string, patch: Partial<LocalModel>) => run(async () => {
  // Objets purs uniquement : les proxys Vue ne traversent pas l'IPC (« An object could not be cloned »).
  const next = (s.value?.localModels ?? []).map((m) => ({ id: m.id, label: m.label, on: m.on }))
    .map((m) => (m.id === id ? { ...m, ...patch } : m));
  await updateSettings({ localModels: next });
});
const toggleLocal = (id: string) => saveLocal(id, { on: !(s.value?.localModels ?? []).find((m) => m.id === id)?.on });
const renameLocal = (id: string, e: Event) => saveLocal(id, { label: ((e.target as HTMLInputElement).value || '').trim() || id });

const tab = ref<FormatKind>('recap');
const draft = ref<OutputFormat | null>(null);
const formatsOf = computed(() => (s.value?.formats ?? []).filter((f) => f.kind === tab.value));
const defautOf = (k: FormatKind) => (s.value?.formatsDefaut ?? {})[k] ?? '';

const openTab = (k: FormatKind) => { tab.value = k; draft.value = null; };
const openNew = () => { draft.value = { id: 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), label: '', kind: tab.value, text: '' }; };
const openEditor = (f: OutputFormat) => { draft.value = { ...f }; };
const applyPreset = (text: string) => { if (draft.value) draft.value.text = text; };

const saveFormats = (next: OutputFormat[]) => run(async () => { s.value = await window.api.setSettings({ formats: next }); });
const saveDraft = () => {
  const d = draft.value;
  if (!d || !d.label.trim() || !d.text.trim()) return;
  const clean = { id: d.id, label: d.label.trim(), kind: d.kind, text: d.text.trim() };
  const next = [...(s.value?.formats ?? [])];
  const i = next.findIndex((f) => f.id === clean.id);
  if (i >= 0) next[i] = clean; else next.push(clean);
  saveFormats(next);
  draft.value = null;
};
const removeFormat = (id: string) => {
  // Le défaut qui pointait vers ce format est retiré par la validation du main process.
  saveFormats((s.value?.formats ?? []).filter((f) => f.id !== id));
  draft.value = null;
};
const applyDefaut = (id: string) => run(async () => {
  s.value = await window.api.setSettings({ formatsDefaut: { ...(s.value?.formatsDefaut ?? {}), [tab.value]: id } });
});

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
.row-actions { display: flex; gap: 6px; align-items: center; }
.clamp { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; max-width: 480px; }
.editor { display: flex; flex-direction: column; gap: 10px; margin-top: 8px; padding: 12px; border: 1px solid var(--line-2); border-radius: 8px;
  input, textarea { width: 100%; background: none; border: none; border-bottom: 1px solid var(--line-2); color: var(--text); font-size: 14px; padding: 2px 0; resize: vertical;
    &:focus { outline: none; border-bottom-color: var(--blue); } }
  textarea { font-family: inherit; line-height: 1.5; }
}
</style>
