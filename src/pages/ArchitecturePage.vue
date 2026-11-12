<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import ArchBackground from '../components/ArchBackground.vue';
import ArchGraph from '../components/ArchGraph.vue';
import ArchMcp from '../components/ArchMcp.vue';
import ArchRoute from '../components/ArchRoute.vue';
import ArchScripts from '../components/ArchScripts.vue';
import ArchSubagents from '../components/ArchSubagents.vue';
import ArchVersions from '../components/ArchVersions.vue';
import { useProject } from '../composables/useProject';
import EntityDialog from '../components/EntityDialog.vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import { NODE_FIELDS, isLocalModel } from '../shared/entities';
import type { ArchEdgeKind, ArchNode, LibraryNode, WorkflowDef } from '../shared/types';

const { data, saveInstruction, saveEntity, deleteEntity, workflowOp } = useProject();

// --- Création, modification, suppression ---
const dlg = ref<{ open: boolean; kind?: 'workflow' | 'library'; path: string | null; values: Record<string, unknown> }>({ open: false, path: null, values: {} });
const nodeDlg = ref(false);
const confirm = ref(false);
const confirmTitle = ref('');
const confirmMsg = ref('');
let confirmAction: () => Promise<void> = async () => {};
const opError = ref('');

function openWorkflow(w: WorkflowDef | null) {
  dlg.value = { open: true, kind: 'workflow', path: w ? w.path : null, values: w ? { ...w } : {} };
}
function openLibrary(c: (LibraryNode & { id: string }) | null) {
  dlg.value = { open: true, kind: 'library', path: c ? c.path : null, values: c ? { ...c } : { type: 'agent', model: 'Sonnet 5.5', effort: 'Moyen' } };
}
function ask(title: string, msg: string, action: () => Promise<void>) {
  confirmTitle.value = title; confirmMsg.value = msg; confirmAction = action; confirm.value = true;
}
const runConfirm = () => confirmAction();
function askDeleteWorkflow(w: WorkflowDef) {
  ask('Supprimer ce workflow ?', w.name + ' (' + w.path + ')', async () => {
    await deleteEntity('workflow', w.path);
    wfId.value = '';
  });
}
function askDeleteLibrary(c: LibraryNode & { id: string }) {
  ask('Supprimer ce nœud de la bibliothèque ?', c.label, () => deleteEntity('library', c.path));
}

async function op(o: Parameters<typeof workflowOp>[1]) {
  if (!wf.value) return;
  opError.value = '';
  try { await workflowOp(wf.value.id, o); }
  catch (e) { showErr(e); }
}
function showErr(e: unknown) {
  opError.value = (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']*': (Error: )?/, '');
}

// --- Création par glisser-déposer quand aucun workflow n'existe ---
const slugf = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
const zoneOver = ref(false);
const PAL_TYPES = ['text/arch-lib', 'text/arch-type'];
const fromPalette = (e: DragEvent) => {
  const types = e.dataTransfer?.types ?? [];
  return PAL_TYPES.some((t) => types.includes(t)) || (types.length === 0 || !types.includes('Files'));
};
function zoneDragOver(e: DragEvent) {
  if (!fromPalette(e)) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  zoneOver.value = true;
}
/** Dépose une première étape sans workflow : crée le workflow, puis pose l'étape. */
async function createByDrop(e: DragEvent) {
  e.preventDefault();
  zoneOver.value = false;
  const dt = e.dataTransfer;
  if (!dt) return;
  const lib = dt.getData('text/arch-lib');
  const type = dt.getData('text/arch-type');
  if (!lib && !type) return;
  const name = 'Nouveau workflow';
  let id = slugf(name) || 'workflow';
  let n = 2;
  const taken = new Set(workflows.value.map((w) => w.id));
  while (taken.has(id)) id = slugf(name) + '-' + n++;
  opError.value = '';
  try {
    await saveEntity('workflow', null, { id, name, when: '' }, undefined, true);
    wfId.value = id;
    const w = wf.value;
    if (w) {
      let l = 0;
      while (w.nodes.some((x) => Math.abs(x.l - l) < 1)) l += 1;
      const before = new Set(w.nodes.map((x) => x.id));
      await op({ op: 'add', libId: lib || undefined, type: (lib ? undefined : type) as 'agent' | 'script' | 'human' | 'alert' | undefined, c: 0, l });
      sel.value = wf.value?.nodes.find((x) => !before.has(x.id))?.id ?? '';
    }
  } catch (e) { showErr(e); }
}
const INSERT: { type: 'agent' | 'script' | 'human' | 'alert'; label: string }[] = [
  { type: 'agent', label: 'Agent' }, { type: 'script', label: 'Script' }, { type: 'human', label: 'Ta validation' }, { type: 'alert', label: 'Alerte' }
];
const EDGE_LABEL: Record<ArchEdgeKind, string> = { ok: 'Suite normale', fail: 'Lien d\'échec', blocked: 'Lien bloqué' };
const EDGE_KINDS: ArchEdgeKind[] = ['ok', 'fail', 'blocked'];
const outgoing = computed(() => (wf.value && cur.value ? wf.value.edges.filter((e) => e[0] === cur.value!.id) : []));
const nodeLabel = (id: string) => wf.value?.nodes.find((n) => n.id === id)?.label ?? id;
const nodeFields = computed(() => {
  const t = cur.value?.type;
  const keep = t === 'agent' ? null : t === 'script' ? ['label', 'command', 'success', 'retries', 'cond'] : ['label'];
  return NODE_FIELDS.filter((f) => !keep || keep.includes(f.key));
});
const nodeValues = computed(() => ({ ...(cur.value ?? {}) }));
async function saveNode(fields: Record<string, unknown>) {
  if (!cur.value || !wf.value) return;
  await workflowOp(wf.value.id, { op: 'update', nodeId: cur.value.id, fields });
}
function askRemoveNode() {
  const n = cur.value;
  if (!n) return;
  ask('Retirer cette étape ?', n.label + '. Les liens se recollent autour.', async () => {
    await workflowOp(wf.value!.id, { op: 'remove', nodeId: n.id });
    sel.value = '';
  });
}

const TABS = [
  { id: 'graph', label: 'Workflow' },
  { id: 'lib', label: 'Bibliothèque' },
  { id: 'scripts', label: 'Scripts' },
  { id: 'agents', label: 'Sous-agents' },
  { id: 'instr', label: 'Instructions' },
  { id: 'route', label: 'Routage' },
  { id: 'bg', label: 'Tâches de fond' },
  { id: 'mcp', label: 'Journal MCP' },
  { id: 'ver', label: 'Versions' }
];
const TYPE_LABEL = { agent: 'Agent', script: 'Script', human: 'Toi', alert: 'Alerte' };
const TYPE_CLS = { agent: 'ok', script: 'blue', human: 'hint', alert: 'fail' };
const PURPOSES = ['Général', 'Sécurité', 'Migration', 'Simple', 'Docs', 'Tests', 'Revue'];

const tab = ref('graph');
const wfId = ref('');
const sel = ref('');
const purpose = ref('all');
const libQuery = ref('');
const detailsOpen = ref(true);
const linkTo = ref('');
const linkKind = ref<ArchEdgeKind>('ok');

const paletteCards = computed(() => {
  const q = libQuery.value.trim().toLowerCase();
  return libCards.value.filter((c) => !q || c.label.toLowerCase().includes(q) || c.model.toLowerCase().includes(q));
});
const linkTargets = computed(() => (wf.value?.nodes ?? []).filter((n) => n.id !== cur.value?.id && !outgoing.value.some((e) => e[1] === n.id)));

function dragLib(e: DragEvent, id: string) {
  e.dataTransfer?.setData('text/arch-lib', id);
  e.dataTransfer?.setData('text/plain', id); // secours si les types personnalisés sont masqués
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
}
function dragType(e: DragEvent, type: string) {
  e.dataTransfer?.setData('text/arch-type', type);
  e.dataTransfer?.setData('text/plain', type); // secours si les types personnalisés sont masqués
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
}
async function onDrop(p: { libId?: string; type?: string; nodeId?: string; c: number; l: number }) {
  if (!wf.value) return;
  const before = new Set(wf.value.nodes.map((n) => n.id));
  if (p.nodeId) await op({ op: 'move', nodeId: p.nodeId, c: p.c, l: p.l });
  else await op({ op: 'add', libId: p.libId, type: p.type as 'agent' | 'script' | 'human' | 'alert' | undefined, c: p.c, l: p.l });
  const added = wf.value?.nodes.find((n) => !before.has(n.id));
  if (added) sel.value = added.id;
  else if (p.nodeId) sel.value = p.nodeId;
}
async function onLink(from: string, to: string) {
  await op({ op: 'link', from, to, kind: 'ok' });
  sel.value = from;
}
/** Bouton + de la bibliothèque : place l'étape dans la première case libre à droite de l'étape choisie et la relie. */
function colOf(id: string, seen: string[] = []): number {
  const w = wf.value;
  const n = w?.nodes.find((x) => x.id === id);
  if (!w || !n) return 0;
  if (n.c !== null) return n.c;
  if (seen.includes(id)) return 0;
  const ps = w.edges.filter((e) => e[1] === id).map((e) => e[0]);
  return ps.length ? Math.max(...ps.map((p) => colOf(p, [...seen, id]))) + 1 : 0;
}
async function addNext(what: { libId?: string; type?: 'agent' | 'script' | 'human' | 'alert' }) {
  const w = wf.value;
  if (!w) return;
  const from = cur.value;
  const cols = w.nodes.map((n) => colOf(n.id));
  const c = from ? colOf(from.id) + 1 : (cols.length ? Math.max(...cols) + 1 : 0);
  let l = from ? from.l : 0;
  while (w.nodes.some((n) => colOf(n.id) === c && Math.abs(n.l - l) < 1)) l += 1;
  if (what.type === 'alert' && from) l = Math.max(l, from.l + 1);
  const before = new Set(w.nodes.map((n) => n.id));
  await op({ op: 'add', ...what, c, l });
  const added = wf.value?.nodes.find((n) => !before.has(n.id));
  if (added && from) await op({ op: 'link', from: from.id, to: added.id, kind: what.type === 'alert' ? 'fail' : 'ok' });
  if (added) sel.value = added.id;
}
async function addLink() {
  if (!cur.value || !linkTo.value) return;
  await op({ op: 'link', from: cur.value.id, to: linkTo.value, kind: linkKind.value });
  linkTo.value = '';
}

const workflows = computed(() => data.value?.workflows ?? []);
const wf = computed(() => workflows.value.find((w) => w.id === wfId.value) ?? null);
const cur = computed<ArchNode | null>(() => wf.value?.nodes.find((n) => n.id === sel.value) ?? wf.value?.nodes[0] ?? null);

// --- Profil du workflow (nom, quand l'utiliser) : éditable dans le panneau du bas ---
const wDraft = ref({ name: '', when: '' });
watch(wf, (w) => { if (w) wDraft.value = { name: w.name, when: w.when }; }, { immediate: true });
const wfDirty = computed(() => !!wf.value && (wDraft.value.name !== wf.value.name || wDraft.value.when !== wf.value.when));
async function saveWf() {
  if (!wf.value) return;
  opError.value = '';
  try { await saveEntity('workflow', wf.value.path, { name: wDraft.value.name.trim() || 'Nouveau workflow', when: wDraft.value.when }); }
  catch (e) { showErr(e); }
}

watch(workflows, (list) => {
  if (!wfId.value && list.length) pick(list[0].id);
}, { immediate: true });

function pick(id: string) {
  wfId.value = id;
  tab.value = 'graph';
  sel.value = workflows.value.find((w) => w.id === id)?.nodes[0]?.id ?? '';
}

const usage = computed(() => {
  const out = new Map<string, string[]>();
  for (const w of workflows.value) for (const n of w.nodes) if (n.libId) out.set(n.libId, [...(out.get(n.libId) ?? []), w.name]);
  return out;
});
const libCards = computed(() => (data.value?.library ?? [])
  .map((l) => ({ ...l, id: l.path.replace(/^library\//, '').replace(/\.md$/, '') }))
  .filter((l) => purpose.value === 'all' || l.purposes.includes(purpose.value)));

const docTitle = (p: string) => data.value?.docs.find((d) => d.path === p)?.title ?? p;

// Instructions : l'éditeur écrit dans les vrais fichiers CLAUDE.md du projet.
const instr = computed(() => data.value?.instructions ?? []);
const instrPath = ref('');
const draft = ref('');
const saving = ref('');
const current = computed(() => instr.value.find((f) => f.path === instrPath.value) ?? null);
watch(instr, (list) => {
  if (!list.length) return;
  if (!list.some((f) => f.path === instrPath.value)) instrPath.value = list[0].path;
}, { immediate: true });
watch(current, (f) => { if (f) draft.value = f.text; }, { immediate: true });
const dirty = computed(() => !!current.value && draft.value !== current.value.text);
const tokens = computed(() => Math.round(draft.value.length / 4));

async function saveInstr() {
  if (!current.value) return;
  saving.value = '';
  try {
    await saveInstruction(current.value.path, draft.value);
    saving.value = 'Enregistré.';
  } catch {
    saving.value = "Impossible d'enregistrer ce fichier.";
  }
}
</script>

<template>
  <div class="arch">
    <aside class="side" aria-label="Workflows">
      <span class="h">Workflows</span>
      <button v-for="w in workflows" :key="w.id" class="wrow" :class="{ sel: w.id === wfId }" :aria-pressed="w.id === wfId" @click="pick(w.id)">
        <span class="wn">{{ w.name }}</span>
        <span class="ww">{{ w.when }}</span>
      </button>
      <span v-if="!workflows.length" class="hint">Aucun fichier dans <span class="mono">workflows/</span>.</span>
      <button class="btn main addwf" @click="openWorkflow(null)">Nouveau workflow</button>
    </aside>

    <main class="center">
      <div class="bar">
        <strong>{{ tab === 'graph' ? (wf?.name ?? 'Architecture') : 'Architecture' }}</strong>
        <span v-if="wf && tab === 'graph'" class="row-actions">
          <button class="btn small" @click="openWorkflow(wf)">Renommer</button>
          <button class="btn small danger" @click="askDeleteWorkflow(wf)">Supprimer</button>
        </span>
        <div class="tabs" role="tablist">
          <button v-for="t in TABS" :key="t.id" class="tab" :class="{ sel: tab === t.id }" role="tab" :aria-selected="tab === t.id" @click="tab = t.id">{{ t.label }}</button>
        </div>
      </div>

      <div v-if="tab === 'graph'" class="graphwrap">
        <div class="work">
          <div class="scroll" aria-label="Grille du workflow">
            <div v-if="!wf" class="dropzone" :class="{ over: zoneOver }" aria-label="Zone de création du workflow" @dragover="zoneDragOver" @dragleave="zoneOver = false" @drop="createByDrop">
              <strong>Glisse ici une étape de la palette</strong>
              <span class="hint2">Ça crée un nouveau workflow, configurable ensuite.</span>
            </div>
            <ArchGraph v-else :nodes="wf.nodes" :edges="wf.edges" :selected="cur?.id ?? ''" @select="sel = $event" @drop="onDrop" @link="onLink" />
          </div>
          <aside class="palette" aria-label="Bibliothèque de nœuds">
            <div class="phead">
              <div class="prow"><span class="h">Bibliothèque</span><button class="btn small main" @click="openLibrary(null)">+ Nouveau nœud</button></div>
              <span class="hint2">Glisse un nœud dans la grille, ou clique + pour l'ajouter après l'étape choisie.</span>
            </div>
            <input v-model="libQuery" class="search" type="search" aria-label="Chercher un nœud" placeholder="Chercher un nœud">
            <div class="chips">
              <button class="seg-s" :class="{ sel: purpose === 'all' }" :aria-pressed="purpose === 'all'" @click="purpose = 'all'">Tous</button>
              <button v-for="p in PURPOSES" :key="p" class="seg-s" :class="{ sel: purpose === p }" :aria-pressed="purpose === p" @click="purpose = p">{{ p }}</button>
            </div>
            <span class="small">Étapes vides</span>
            <div class="plist">
              <div v-for="i in INSERT" :key="i.type" class="pitem" :class="i.type" draggable="true" @dragstart="dragType($event, i.type)">
                <span class="pl">{{ i.label }}</span>
                <span class="tag" :class="TYPE_CLS[i.type]">{{ TYPE_LABEL[i.type] }}</span>
                <button class="ic" :aria-label="'Ajouter ' + i.label + ' au workflow'" title="Ajouter à droite de l'étape choisie" @click="addNext({ type: i.type })"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M7 1v12M1 7h12" /></svg></button>
              </div>
            </div>
            <span class="small">Nœuds partagés</span>
            <div class="plist">
              <div v-for="c in paletteCards" :key="c.id" class="pitem" :class="c.type" draggable="true" @dragstart="dragLib($event, c.id)">
                <span class="pl">{{ c.label }}</span>
                <span class="mono pm">{{ c.type === 'agent' ? c.model : c.type === 'script' ? c.command : TYPE_LABEL[c.type] }}</span>
                <span class="pact">
                  <button class="ic" :aria-label="'Modifier le nœud ' + c.label" title="Modifier ce nœud partagé" @click="openLibrary(c)"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.5 2.5l3 3L6 13H3v-3z M9 4l3 3" /></svg></button>
                  <button class="ic del" :aria-label="'Supprimer le nœud ' + c.label" title="Supprimer ce nœud partagé" @click="askDeleteLibrary(c)"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9h6.6L12 4M6.5 7v3.5M9.5 7v3.5" /></svg></button>
                </span>
                <button class="ic" :aria-label="'Ajouter ' + c.label + ' au workflow'" title="Ajouter à droite de l'étape choisie" @click="addNext({ libId: c.id })"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M7 1v12M1 7h12" /></svg></button>
              </div>
              <span v-if="!paletteCards.length" class="hint2">Aucun nœud ne correspond.</span>
            </div>
          </aside>
        </div>
        <p v-if="opError" class="err bar-err" role="alert">{{ opError }}</p>

        <section v-if="cur" class="details" :class="{ folded: !detailsOpen }" aria-label="Détails de l'étape">
          <div class="dhead">
            <strong class="it">{{ cur.label }}</strong>
            <span class="tag" :class="TYPE_CLS[cur.type]">{{ TYPE_LABEL[cur.type] }}</span>
            <span v-if="cur.libId" class="tag blue">Bibliothèque</span>
            <span class="grow" />
            <button class="btn small main" @click="nodeDlg = true">Modifier</button>
            <button v-if="cur.libId" class="btn small" @click="op({ op: 'detach', nodeId: cur.id })">Détacher</button>
            <button class="btn small danger" @click="askRemoveNode">Retirer</button>
            <button class="btn small" :aria-expanded="detailsOpen" @click="detailsOpen = !detailsOpen">{{ detailsOpen ? 'Replier' : 'Déplier' }}</button>
          </div>
          <div v-if="detailsOpen" class="dbody">
            <div class="dgrid">
      <template v-if="cur.type === 'agent'">
        <div class="field"><span class="small">Modèle</span><span>{{ cur.model }}{{ isLocalModel(cur.model) ? ' (local, Ollama)' : '' }}</span></div>
        <div class="field"><span class="small">Intensité</span><span>{{ cur.effort }}</span></div>
        <div class="field"><span class="small">Repli</span><span>{{ cur.fallback.length ? cur.fallback.join(' puis ') : "Aucun, le nœud s'arrête en alerte." }}</span></div>
        <div class="field"><span class="small">Usages</span><div class="chips"><span v-for="p in cur.purposes" :key="p" class="tag ok">{{ p }}</span><span v-if="!cur.purposes.length" class="sub2">Aucun</span></div></div>
        <div class="field"><span class="small">Skills</span><div class="chips"><span v-for="s in cur.skills" :key="s" class="tag">{{ s }}</span><span v-if="!cur.skills.length" class="sub2">Aucun</span></div></div>
        <div class="field"><span class="small">Plugins</span><div class="chips"><span v-for="s in cur.plugins" :key="s" class="tag">{{ s }}</span><span v-if="!cur.plugins.length" class="sub2">Aucun</span></div></div>
        <div class="field"><span class="small">Outils</span><div class="chips"><span v-for="s in cur.tools" :key="s" class="tag">{{ s }}</span></div></div>
        <div class="field">
          <span class="small">Documents attachés</span>
          <div v-for="d in cur.docs" :key="d.path" class="doc"><span>{{ docTitle(d.path) }}</span><span class="tag" :class="d.role === 'write' ? 'hint' : ''">{{ d.role === 'write' ? 'Mis à jour' : 'Lu' }}</span></div>
          <span v-if="!cur.docs.length" class="sub2">Aucun document attaché.</span>
        </div>
        <div v-if="cur.slot" class="field">
          <span class="small">Emplacement</span><span>{{ cur.slot.on ? 'Adaptatif : le planificateur choisit dans le pool' : 'Fixe' }}</span>
          <template v-if="cur.slot.on">
            <div class="chips"><span v-for="s in cur.slot.skills" :key="s" class="tag blue">{{ s }}</span><span v-for="d in cur.slot.docs" :key="d" class="tag blue">{{ docTitle(d) }}</span><span v-for="a in cur.slot.agents" :key="a" class="tag blue">{{ a }}</span></div>
          </template>
        </div>
        <div class="field"><span class="small">Consigne</span><p class="txt">{{ cur.prompt }}</p></div>
        <div class="field"><span class="small">Réussite</span><p class="txt">{{ cur.success }}</p></div>
        <div class="field"><span class="small">Essais, budget, condition</span><span>{{ cur.retries }} · {{ cur.budget }} · {{ cur.cond }}</span></div>
        <div class="field"><span class="small">Branche git</span><span>{{ cur.isolated ? 'Isolée, fusionnée par le nœud de fusion.' : 'Commune à la session.' }}</span></div>
      </template>

      <template v-else-if="cur.type === 'script'">
        <div class="field"><span class="small">Commande</span><code class="mono code">{{ cur.command }}</code></div>
        <div class="field"><span class="small">Réussite</span><span>{{ cur.success }}</span></div>
        <div class="field"><span class="small">Essais, condition</span><span>{{ cur.retries }} · {{ cur.cond }}</span></div>
      </template>
      <span v-else-if="cur.type === 'human'" class="sub">Point d'arrêt : le workflow attend ta décision avant de continuer.</span>
      <span v-else class="sub">Prévient l'application quand un lien d'échec ou bloqué arrive ici.</span>

            </div>
            <div class="links">
              <span class="small">Profil du workflow</span>
              <div class="addlink">
                <input v-model="wDraft.name" class="lsel grow-name" aria-label="Nom du workflow" placeholder="Nom du workflow" @keydown.enter="saveWf">
                <input v-model="wDraft.when" class="lsel grow-name" aria-label="Quand l'utiliser" placeholder="Quand l'utiliser" @keydown.enter="saveWf">
                <button class="btn small main" :disabled="!wfDirty" title="Enregistrer le nom et la description du workflow" @click="saveWf">Enregistrer</button>
              </div>
              <span class="small">Liens sortants</span>
              <div v-for="e in outgoing" :key="e[1]" class="edge">
                <span class="et">vers {{ nodeLabel(e[1]) }}</span>
                <span class="chips">
                  <button v-for="k in EDGE_KINDS" :key="k" class="seg-s" :class="{ sel: e[2] === k }" :aria-pressed="e[2] === k" @click="op({ op: 'edgeKind', from: cur.id, to: e[1], kind: k })">{{ EDGE_LABEL[k] }}</button>
                  <button class="ic del" :aria-label="'Supprimer le lien vers ' + nodeLabel(e[1])" title="Supprimer ce lien" @click="op({ op: 'unlink', from: cur.id, to: e[1] })"><svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" /></svg></button>
                </span>
              </div>
              <span v-if="!outgoing.length" class="sub2">Aucun lien. Tire la poignée à droite de l'étape vers une autre.</span>
              <div class="addlink">
                <label for="linkto" class="small">Relier à</label>
                <select id="linkto" v-model="linkTo" class="lsel">
                  <option value="">Choisir une étape</option>
                  <option v-for="n in linkTargets" :key="n.id" :value="n.id">{{ n.label }}</option>
                </select>
                <select v-model="linkKind" class="lsel" aria-label="Type de lien">
                  <option v-for="k in EDGE_KINDS" :key="k" :value="k">{{ EDGE_LABEL[k] }}</option>
                </select>
                <button class="btn small" :disabled="!linkTo" @click="addLink">Relier</button>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div v-else-if="tab === 'lib'" class="page">
        <div class="stack">
          <div class="line"><button class="btn main" @click="openLibrary(null)">Nouveau nœud</button></div>
          <div class="intro">
            <strong>Bibliothèque de nœuds</strong>
            <span class="sub">Un nœud de la bibliothèque est partagé : si tu le modifies, tous les workflows qui l'utilisent suivent.</span>
          </div>
          <div class="chips" role="group" aria-label="Usage">
            <button class="seg" :class="{ sel: purpose === 'all' }" :aria-pressed="purpose === 'all'" @click="purpose = 'all'">Tous</button>
            <button v-for="p in PURPOSES" :key="p" class="seg" :class="{ sel: purpose === p }" :aria-pressed="purpose === p" @click="purpose = p">{{ p }}</button>
          </div>
          <div class="cards">
            <article v-for="c in libCards" :key="c.id" class="card">
              <div class="line">
                <strong>{{ c.label }}</strong>
                <span class="tag" :class="TYPE_CLS[c.type]">{{ TYPE_LABEL[c.type] }}</span>
                <span class="mono small push">{{ c.model }}{{ isLocalModel(c.model) ? ' · local' : ' · ' + c.effort }}</span>
              </div>
              <div class="chips"><span v-for="p in c.purposes" :key="p" class="tag ok">{{ p }}</span><span v-if="c.isolated" class="tag">branche isolée</span></div>
              <span class="sub2">Repli : {{ c.fallback.length ? c.fallback.join(', ') : 'aucun, alerte' }}</span>
              <span class="sub3">{{ usage.get(c.id)?.length ? 'Utilisé dans : ' + usage.get(c.id)!.join(', ') : 'Utilisé nulle part' }}</span>
              <span class="row-actions">
                <button class="btn small" @click="openLibrary(c)">Modifier</button>
                <button class="btn small danger" @click="askDeleteLibrary(c)">Supprimer</button>
              </span>
            </article>
          </div>
        </div>
      </div>

      <div v-else-if="tab === 'instr'" class="instr">
        <section class="files" aria-label="Fichiers d'instructions">
          <span class="h">Fichiers CLAUDE.md</span>
          <button v-for="f in instr" :key="f.path" class="frow" :class="{ sel: f.path === instrPath }" :aria-pressed="f.path === instrPath" @click="instrPath = f.path">
            <span class="fs">{{ f.scope }}</span>
            <span class="mono fp">{{ f.path }}</span>
          </button>
          <span v-if="!instr.length" class="hint">Aucun CLAUDE.md dans ce projet.</span>
        </section>
        <section v-if="current" class="editor" aria-label="Éditeur">
          <div class="line">
            <span class="mono grow">{{ current.path }}</span>
            <span v-if="saving" class="small" role="status">{{ saving }}</span>
            <button class="btn main" :disabled="!dirty" @click="saveInstr">Enregistrer</button>
          </div>
          <label for="claudemd" class="small">Contenu en markdown</label>
          <textarea id="claudemd" v-model="draft" spellcheck="false" @input="saving = ''" />
        </section>
        <aside v-if="current" class="effect" aria-label="Effet">
          <span class="h">Effet de ce fichier</span>
          <div class="card"><span class="small">Chargé à chaque session</span><span class="big">≈ {{ tokens }}</span><span class="sub2">tokens, pour chaque agent qui démarre.</span></div>
          <div class="card"><span class="small">Portée</span><span>{{ current.scope }}</span></div>
          <span class="sub">Ici : les règles communes à tous les workflows. Ce qui concerne un seul nœud va dans sa consigne.</span>
        </aside>
      </div>

      <ArchScripts v-else-if="tab === 'scripts'" />
      <ArchSubagents v-else-if="tab === 'agents'" />
      <ArchRoute v-else-if="tab === 'route'" @open="pick" />
      <ArchBackground v-else-if="tab === 'bg'" />
      <ArchMcp v-else-if="tab === 'mcp'" />
      <ArchVersions v-else-if="tab === 'ver'" :workflow-id="wf?.id ?? ''" :workflow-name="wf?.name ?? ''" />
    </main>


    <EntityDialog v-model="dlg.open" :kind="dlg.kind" :path="dlg.path" :values="dlg.values" />
    <EntityDialog v-model="nodeDlg" :path="cur ? cur.id : null" :values="nodeValues" :field-defs="nodeFields" ai-kind="node" :submit-fn="saveNode" :title-text="'Modifier l\'étape : ' + (cur?.label ?? '')" />
    <ConfirmDialog v-model="confirm" :title="confirmTitle" :message="confirmMsg" :on-confirm="runConfirm" />
  </div>
</template>

<style scoped lang="scss">
:where(button:not(.btn, .chipb)) { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; text-align: left; padding: 0; }
.arch { display: flex; height: calc(100vh - 56px); min-height: 0; overflow: hidden; }
.side { flex: 0 0 232px; box-sizing: border-box; background: var(--panel); border-right: 1px solid var(--line); padding: 16px 12px; display: flex; flex-direction: column; gap: 2px; overflow: auto; .h { padding: 0 8px 6px; } }
.wrow { display: flex; flex-direction: column; padding: 8px; min-height: 56px; justify-content: center; border-radius: 8px; &:hover { background: #1f1f23; } &.sel { background: #232327; box-shadow: inset 0 0 0 1px var(--line-2); } }
.wn { font-size: 13px; font-weight: 500; }
.ww { font-size: 11px; color: var(--muted); }
.center { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
.bar { flex: none; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 8px 16px; border-bottom: 1px solid var(--line); strong { font-size: 15px; } }
.tabs { display: flex; gap: 4px; flex-wrap: wrap; }
.tab { height: 40px; padding: 0 14px; display: flex; align-items: center; border-radius: 8px; font-size: 13px; color: var(--muted-2); &:hover { color: var(--text); } &.sel { background: #2e2e34; color: var(--text); } }
.graphwrap { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; background: var(--bg); }
.work { flex: 1 1 auto; min-height: 0; display: flex; }
.scroll { flex: 1 1 0; min-width: 0; min-height: 0; overflow: auto; }
.palette { flex: 0 0 280px; box-sizing: border-box; background: var(--panel); border-left: 1px solid var(--line); padding: 14px 12px; display: flex; flex-direction: column; gap: 10px; overflow: auto; }
.palette > * { flex: none; }
.prow { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.pact { display: none; gap: 0; }
.pitem:hover .pact, .pitem:focus-within .pact { display: inline-flex; }
.pitem:hover .pm, .pitem:focus-within .pm { display: none; }
.phead { display: flex; flex-direction: column; gap: 2px; padding: 0 4px; }
.hint2 { font-size: 12px; color: var(--muted); }
.search { height: 40px; box-sizing: border-box; padding: 0 12px; background: var(--bg); border: 1px solid var(--line-2); border-radius: 8px; color: var(--text); font: inherit; font-size: 13px; &:focus { outline: none; border-color: var(--clay); } }
.plist { display: flex; flex-direction: column; gap: 6px; }
.pitem {
  display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 4px 4px 4px 12px; box-sizing: border-box; border-radius: 10px;
  background: var(--bg); border: 1.5px solid #4a4a53; cursor: grab; font-size: 13px;
  &:hover { border-color: #8c8983; }
  &:active { cursor: grabbing; }
  &.script { border-style: dashed; border-color: #7db4ff; }
  &.human { border-color: #6b5316; }
  &.alert { border-style: dashed; border-color: #7a3a3a; }
  .pl { flex: 1; min-width: 0; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pm { font-size: 11px; color: var(--muted-2); max-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
}
.newnode { align-self: flex-start; margin-top: 4px; }
.bar-err { margin: 0; padding: 8px 16px; border-top: 1px solid #7a3a3a; background: #241414; color: var(--fail); font-size: 13px; }
.details { flex: none; max-height: 42%; display: flex; flex-direction: column; background: var(--panel); border-top: 1px solid var(--line); &.folded { max-height: none; } }
.dhead { flex: none; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 10px 16px; border-bottom: 1px solid var(--line); }
.dbody { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 14px 16px 16px; display: grid; grid-template-columns: minmax(0, 1fr) minmax(300px, 380px); gap: 16px 28px; font-size: 13px; }
.dgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 14px 20px; align-content: start; }
.links { display: flex; flex-direction: column; gap: 8px; border-left: 1px solid var(--line); padding-left: 20px; }
.et { font-size: 13px; }
.addlink { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 4px; }
.grow-name { flex: 1 1 140px; min-width: 0; }
.dropzone { flex: 1 1 auto; margin: 24px; border: 2px dashed var(--line-2); border-radius: 14px; display: flex; flex-direction: column; gap: 6px; align-items: center; justify-content: center; text-align: center; padding: 24px; color: var(--muted); background: var(--panel); transition: border-color .12s, background .12s; & * { pointer-events: none; } &.over { border-color: var(--clay); background: rgba(232, 132, 92, .06); color: var(--text); } }
.lsel { height: 32px; background: var(--bg); border: 1px solid var(--line-2); border-radius: 8px; color: var(--text); font: inherit; font-size: 12px; padding: 0 8px; }
.page { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 20px 24px 24px; }
.stack { max-width: 960px; display: flex; flex-direction: column; gap: 16px; }
.intro { display: flex; flex-direction: column; gap: 2px; strong { font-size: 16px; } }
.sub { font-size: 13px; color: var(--muted-2); }
.sub2 { font-size: 13px; color: #c9c6bf; }
.sub3 { font-size: 12px; color: var(--muted); }
.small:not(.btn) { font-size: 12px; color: var(--muted); }
.chips { display: flex; gap: 6px; flex-wrap: wrap; }
.seg { height: 40px; padding: 0 12px; display: flex; align-items: center; font-size: 13px; color: var(--muted-2); border-radius: 8px; border: 1px solid #34343b; &:hover { color: var(--text); } &.sel { background: #2e2e34; color: var(--text); border-color: #4a4a53; } }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(380px, 100%), 1fr)); gap: 14px; }
.line { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.push { margin-left: auto; color: var(--muted-2); }
.instr { flex: 1 1 auto; min-height: 0; display: flex; overflow: hidden; }
.files { flex: 0 0 260px; box-sizing: border-box; padding: 16px 12px; border-right: 1px solid var(--line); display: flex; flex-direction: column; gap: 6px; overflow: auto; .h { padding: 0 8px 6px; } }
.frow { display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border-radius: 10px; min-height: 56px; &:hover { background: #1f1f23; } &.sel { background: #232327; box-shadow: inset 0 0 0 1px var(--line-2); } }
.fs { font-weight: 500; font-size: 13px; }
.fp { font-size: 11px; color: var(--muted); }
.editor { flex: 1 1 0; min-width: 0; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
.grow { flex: 1; font-size: 13px; }
.dhead .grow { font-size: 0; }
.editor textarea { flex: 1 1 auto; min-height: 260px; box-sizing: border-box; width: 100%; resize: none; background: var(--panel); border: 1px solid var(--line-2); border-radius: 12px; color: var(--text); font-family: 'JetBrains Mono', 'SF Mono', Menlo, monospace; font-size: 13px; line-height: 1.6; padding: 16px; }
.btn[disabled] { opacity: .4; cursor: default; }
.effect { flex: 0 0 280px; box-sizing: border-box; padding: 16px; border-left: 1px solid var(--line); display: flex; flex-direction: column; gap: 14px; overflow: auto; }
.big { font-size: 22px; font-weight: 600; }
.it { font-size: 16px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.doc { display: flex; align-items: center; gap: 8px; justify-content: space-between; }
.txt { margin: 0; color: #d6d3cc; }
.code { background: var(--panel-2); padding: 6px 8px; border-radius: 6px; }
.hint { font-size: 12px; color: var(--muted); padding: 0 8px; }
.addwf { margin-top: 10px; justify-content: center; }
.actions { display: flex; flex-direction: row; flex-wrap: wrap; gap: 6px; }
.edge { display: flex; flex-direction: column; gap: 4px; }
.seg-s { height: 32px; padding: 0 10px; border-radius: 8px; border: 1px solid #34343b; font-size: 12px; color: var(--muted-2); &.sel { background: #2e2e34; color: var(--text); border-color: #4a4a53; } }
</style>
