<template>
  <q-page class="page">
    <div v-if="!data || !data.exists" class="empty">
      <span class="h">Documentation</span>
      <p>Aucun dossier de projet n'est ouvert.</p>
      <button class="btn main" @click="choose">Choisir le dossier du projet</button>
    </div>

    <div v-else class="layout">
      <aside class="types" aria-label="Types">
        <span class="h">Types</span>
        <button class="btn main add" @click="newDoc">{{ filter === 'memory' ? 'Nouvelle entrée' : 'Nouveau document' }}</button>
        <button
          v-for="t in types" :key="t.id" class="type" :class="{ sel: filter === t.id, drop: dropType === t.id, wait: dropping === t.id }"
          :aria-pressed="filter === t.id"
          :title="t.hasCommand ? 'Dépose un fichier ici : je transforme son contenu en document ' + t.label : null"
          @click="filter = t.id" @dragover="typeDragOver($event, t)" @dragleave="dropType === t.id && (dropType = '')" @drop="typeDrop($event, t)"
        >
          <span class="grow">{{ t.label }}</span>
          <span v-if="dropping === t.id" class="n">…</span>
          <span v-else class="mono n">{{ t.count }}</span>
        </button>
        <button class="btn small add-type" @click="openTypeDlg">+ Nouveau type</button>
        <p v-if="dropErr" class="fail-text drop-err" role="alert">{{ dropErr }}</p>
      </aside>

      <section class="list" aria-label="Documents">
        <button
          v-for="d in shown" :key="d.path" class="doc" :class="{ sel: current?.path === d.path }"
          :aria-pressed="current?.path === d.path" @click="selected = d.path"
        >
          <span class="row"><b>{{ d.title }}</b><span class="tag">{{ typeLabel(d.type) }}</span></span>
          <span class="mono path">{{ d.path }}</span>
          <span class="meta">{{ d.project }}<template v-if="d.updated"> · {{ d.updated }}</template></span>
        </button>
      </section>

      <main class="preview">
        <template v-if="current">
          <div class="row head">
            <span class="doc-title">{{ current.title }}</span>
            <span class="tag">{{ typeLabel(current.type) }}</span>
            <span class="row-actions">
              <button v-if="current.type !== 'memory'" class="btn small" @click="openAi">{{ sel ? 'Modifier la sélection' : 'Mettre à jour avec l\'IA' }}</button>
              <button class="btn small" @click="editCurrent">Modifier</button>
              <button class="btn small danger" @click="askDelete(current.type === 'memory' ? 'memory' : 'doc', current.path, current.title)">Supprimer</button>
            </span>
          </div>
          <article class="card body" @pointerup="captureSel">
            <template v-for="(l, i) in lines" :key="i">
              <h3 v-if="l.kind === 'h'" :data-src="l.src">{{ l.text }}</h3>
              <pre v-else-if="l.kind === 'code'" class="code mono" :data-src="l.src">{{ l.text }}</pre>
              <p v-else-if="l.kind === 'li'" class="li" :data-src="l.src">{{ l.text }}</p>
              <p v-else :data-src="l.src">{{ l.text }}</p>
            </template>
          </article>
        </template>
        <p v-else class="muted">Aucun document dans ce type.</p>
      </main>
    </div>

    <q-dialog v-model="aiOpen" persistent>
      <q-card class="aicard" dark>
        <q-card-section class="aihead">{{ aiTitle }}</q-card-section>
        <q-card-section class="aibody">
          <q-input v-model="aiPrompt" :label="sel ? 'Consigne' : 'Consigne (facultatif)'" type="textarea" autogrow outlined dark dense :hint="aiHint" :disable="aiBusy" />
          <p v-if="sel && aiBusy === false && aiBody === null && !aiError" class="meta">Sélection de {{ selLines }} ligne{{ selLines > 1 ? 's' : '' }} : l'IA ne proposera que son remplacement, le reste du document ne bougera pas.</p>
          <p v-if="aiError" class="fail-text" role="alert">{{ aiError }}</p>
          <template v-if="aiBody !== null">
            <p class="meta">{{ sel ? 'Remplacement proposé pour la sélection.' : (aiLinked.length ? 'Tickets pris en compte : ' + aiLinked.join(', ') : 'Aucun ticket lié à ce document.') }} · {{ added }} lignes ajoutées, {{ removed }} retirées</p>
            <div class="cmp">
              <div><span class="cap">Actuel</span><pre class="mono pane"><span v-for="(l, i) in oldLines" :key="i" :class="{ rem: !newSet.has(l) && l.trim() }">{{ l }}
</span></pre></div>
              <div><span class="cap">Proposé</span><pre class="mono pane"><span v-for="(l, i) in newLines" :key="i" :class="{ add: !oldSet.has(l) && l.trim() }">{{ l }}
</span></pre></div>
            </div>
          </template>
        </q-card-section>
        <q-card-actions align="right">
          <button class="btn" :disabled="aiBusy" @click="aiOpen = false">{{ aiBody === null ? 'Annuler' : 'Rejeter' }}</button>
          <button class="btn" :disabled="aiBusy" @click="runAi">{{ aiBusy ? 'Le modèle réfléchit…' : aiBody === null ? 'Générer' : 'Refaire' }}</button>
          <button v-if="aiBody !== null" class="btn main" :disabled="aiBusy" @click="applyAi">Appliquer</button>
        </q-card-actions>
      </q-card>
    </q-dialog>

    <q-dialog v-model="typeDlg">
      <q-card class="aicard typecard" dark>
        <q-card-section class="aihead">Nouveau type de document</q-card-section>
        <q-card-section class="aibody">
          <q-input v-model="newType" outlined dark dense label="Nom du type (ex. Audit, Post-mortem)" autofocus @keyup.enter="createType" />
          <q-input v-model="newTypeCmd" outlined dark dense class="mono-cmd" label="Commande pour un fichier déposé (facultatif)" hint="Reçoit {file} (ou le chemin en dernier argument) ; sa sortie standard devient le contenu du document." />
          <p v-if="typeErr" class="fail-text" role="alert">{{ typeErr }}</p>
          <span class="muted">Crée le dossier <code class="mono">docs/{{ typeSlug }}</code> dans le projet ; les documents de ce type y sont rangés.</span>
        </q-card-section>
        <q-card-actions align="right">
          <button class="btn" @click="typeDlg = false">Annuler</button>
          <button class="btn main" :disabled="!newType.trim() || typeBusy" @click="createType">Créer</button>
        </q-card-actions>
      </q-card>
    </q-dialog>

    <EntityDialog v-model="dialog" :kind="target.kind" :path="target.path" :values="target.values" :body="target.body" />
    <ConfirmDialog v-model="confirm" title="Supprimer ce fichier ?" :message="removing ? removing.title + ' (' + removing.path + ')' : ''" :on-confirm="doDelete" />
  </q-page>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useProject } from '../composables/useProject';
import EntityDialog from '../components/EntityDialog.vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import type { DocFile, NoteFile } from '../shared/types';

const { data, choose, deleteEntity, proposeDocUpdate, saveEntity, addDocType } = useProject();

const aiOpen = ref(false);
const aiPrompt = ref('');
const aiBusy = ref(false);
const aiError = ref('');
const aiBody = ref<string | null>(null);
const aiLinked = ref<string[]>([]);
/** Sélection dans l'aperçu : bornes en caractères du markdown brut, capturées au moment de la demande. */
const sel = ref<{ start: number; end: number; text: string } | null>(null);

const raws = computed(() => (current.value?.body ?? '').split('\n'));
const offsets = computed(() => {
  let acc = 0;
  return raws.value.map((l) => { const o = acc; acc += l.length + 1; return o; });
});
const selLines = computed(() => (sel.value?.text ?? '').split('\n').length);
const aiTitle = computed(() => sel.value
  ? `Modifier la sélection de « ${current.value?.title ?? ''} »`
  : `Mettre à jour « ${current.value?.title ?? ''} » avec l'IA`);
const aiHint = computed(() => sel.value
  ? 'Décris la modification de la sélection : seule cette partie changera, le reste du document reste en place.'
  : 'Sans consigne, Claude parcourt le code du projet, vérifie que le document est à jour et le corrige (tickets liés pris en compte).');

const oldLines = computed(() => (sel.value ? sel.value.text : (current.value?.body ?? '')).split('\n'));
const newLines = computed(() => (aiBody.value ?? '').split('\n'));
const oldSet = computed(() => new Set(oldLines.value));
const newSet = computed(() => new Set(newLines.value));
const added = computed(() => newLines.value.filter((l) => l.trim() && !oldSet.value.has(l)).length);
const removed = computed(() => oldLines.value.filter((l) => l.trim() && !newSet.value.has(l)).length);
function openAi() { aiPrompt.value = ''; aiBody.value = null; aiError.value = ''; aiLinked.value = []; aiOpen.value = true; }
async function runAi() {
  const c = current.value;
  if (!c) return;
  if (sel.value && !aiPrompt.value.trim()) { aiError.value = 'Décris la modification de la sélection.'; return; }
  aiBusy.value = true; aiError.value = '';
  try {
    if (sel.value) {
      aiBody.value = await window.api.suggestFileEdit({
        path: c.path, content: c.body, instruction: aiPrompt.value,
        selection: { start: sel.value.start, end: sel.value.end, text: sel.value.text }
      });
    } else {
      const r = await proposeDocUpdate(c.path, aiPrompt.value);
      aiBody.value = r.body; aiLinked.value = r.linked;
    }
  } catch (e) { aiError.value = e instanceof Error ? e.message : String(e); }
  finally { aiBusy.value = false; }
}
async function applyAi() {
  const c = current.value;
  if (!c || aiBody.value === null) return;
  const body = sel.value ? c.body.slice(0, sel.value.start) + aiBody.value + c.body.slice(sel.value.end) : aiBody.value;
  try {
    await saveEntity('doc', c.path, { updated: new Date().toISOString().slice(0, 10) }, body);
    aiOpen.value = false;
    sel.value = null;
  } catch (e) { aiError.value = e instanceof Error ? e.message : String(e); }
}

/** Traduit la sélection faite dans l'aperçu (bornes de lignes) en bornes de caractères du markdown brut. */
function captureSel() {
  const s = window.getSelection();
  if (!s || s.isCollapsed || s.rangeCount === 0) { sel.value = null; return; }
  const srcOf = (node: Node | null): number => {
    const el = node?.nodeType === 3 ? node.parentElement : node as HTMLElement | null;
    const hit = el?.closest('[data-src]');
    return hit ? Number(hit.getAttribute('data-src')) : -1;
  };
  const a = srcOf(s.anchorNode);
  const b = srcOf(s.focusNode);
  if (a < 0 || b < 0) { sel.value = null; return; }
  const from = Math.min(a, b);
  const to = Math.max(a, b);
  const body = current.value?.body ?? '';
  const start = offsets.value[from];
  const end = offsets.value[to] + raws.value[to].length;
  sel.value = { start, end, text: body.slice(start, end) };
}

type Target = { kind: 'doc' | 'memory'; path: string | null; values: Record<string, unknown>; body: string };
const dialog = ref(false);
const target = ref<Target>({ kind: 'doc', path: null, values: {}, body: '' });
const confirm = ref(false);
const removing = ref<{ kind: 'doc' | 'memory'; path: string; title: string } | null>(null);
function newDoc() {
  target.value = { kind: filter.value === 'memory' ? 'memory' : 'doc', path: null, values: { type: TYPES.value[filter.value] ? filter.value : 'guide' }, body: '' };
  dialog.value = true;
}
function editDoc(d: DocFile) {
  target.value = { kind: 'doc', path: d.path, values: { title: d.title, type: d.type, project: d.project, updated: d.updated }, body: d.body };
  dialog.value = true;
}
function editNote(n: NoteFile) {
  target.value = { kind: 'memory', path: n.path, values: { title: n.title }, body: n.body };
  dialog.value = true;
}
function askDelete(kind: 'doc' | 'memory', path: string, title: string) {
  removing.value = { kind, path, title };
  confirm.value = true;
}
async function doDelete() { if (removing.value) await deleteEntity(removing.value.kind, removing.value.path); }

// --- Création d'un type de document : dossier docs/<id> + entrée dans docs/types.json ---
const typeDlg = ref(false);
const newType = ref('');
const newTypeCmd = ref('');
const typeErr = ref('');
const typeBusy = ref(false);
const typeSlug = computed(() => newType.value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || '…');
function openTypeDlg() { newType.value = ''; newTypeCmd.value = ''; typeErr.value = ''; typeDlg.value = true; }
async function createType() {
  const label = newType.value.trim();
  if (!label) return;
  typeBusy.value = true; typeErr.value = '';
  try {
    await addDocType(label, newTypeCmd.value.trim() || undefined);
    typeDlg.value = false;
    newType.value = ''; newTypeCmd.value = '';
    filter.value = typeSlug.value;
  } catch (e) { typeErr.value = e instanceof Error ? e.message : String(e); }
  finally { typeBusy.value = false; }
}

const BUILTIN_TYPES: Record<string, string> = {
  cookbook: 'Cookbook', runbook: 'Runbook', spec: 'Spec', adr: 'Décision', guide: 'Guide'
};
/** Types affichés : ceux de l'app complétés par les types créés pour ce projet. */
const TYPES = computed<Record<string, string>>(() => {
  const out: Record<string, string> = { ...BUILTIN_TYPES };
  for (const t of data.value?.customTypes ?? []) if (!out[t.id]) out[t.id] = t.label;
  return out;
});
const typeLabel = (t: string) => (t === 'memory' ? 'Mémoire' : TYPES.value[t] ?? t);

const BUILTIN_IDS = new Set(Object.keys(BUILTIN_TYPES));
const filter = ref('all');
const selected = ref('');

const docs = computed(() => data.value?.docs ?? []);
const notes = computed<DocFile[]>(() => (data.value?.memory ?? []).map((n) => ({ path: n.path, title: n.title, type: 'memory', project: '', updated: '', body: n.body })));
const types = computed(() => [
  { id: 'all', label: 'Tous', count: docs.value.length, hasCommand: false },
  ...Object.keys(TYPES.value).map((id) => ({
    id, label: TYPES.value[id] + (BUILTIN_IDS.has(id) ? 's' : ''), count: docs.value.filter((d) => d.type === id).length,
    hasCommand: (data.value?.customTypes.find((t) => t.id === id)?.command ?? '').trim().length > 0
  }))
]);

// --- Dépôt d'un fichier sur un type : la commande du type crée le document ---
const dropType = ref('');
const dropping = ref('');
const dropErr = ref('');
const acceptsFile = (e: DragEvent) => {
  const t = e.dataTransfer?.types ?? [];
  return t.includes('Files') || t.includes('text/fichier-path') || t.length === 0;
};
function typeDragOver(e: DragEvent, t: { id: string; hasCommand: boolean }) {
  if (!t.hasCommand || !acceptsFile(e)) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  dropType.value = t.id;
}
async function typeDrop(e: DragEvent, t: { id: string }) {
  e.preventDefault();
  dropType.value = '';
  const dt = e.dataTransfer;
  if (!dt) return;
  let filePath = dt.getData('text/fichier-path') || '';
  if (!filePath) {
    const file = dt.files?.[0];
    if (file) filePath = window.api.pathForFile(file) || (file as unknown as { path?: string }).path || '';
  }
  if (!filePath) return;
  dropping.value = t.id; dropErr.value = '';
  try {
    const after = await window.api.dropDocFile(t.id, filePath);
    filter.value = t.id;
    selected.value = after.docs.filter((d) => d.type === t.id).at(-1)?.path ?? '';
  } catch (err) {
    dropErr.value = (err instanceof Error ? err.message : String(err)).replace(/^Error invoking remote method '[^']*': (Error: )?/, '');
  } finally { dropping.value = ''; }
}
const shown = computed(() => (filter.value === 'memory' ? notes.value : docs.value.filter((d) => filter.value === 'all' || d.type === filter.value)));
function editCurrent() {
  const c = current.value;
  if (!c) return;
  if (c.type === 'memory') editNote({ path: c.path, title: c.title, meta: {}, body: c.body });
  else editDoc(c);
}
const current = computed(() => shown.value.find((d) => d.path === selected.value) ?? shown.value[0]);

type Line = { kind: 'h' | 'p' | 'li' | 'code'; text: string; src: number };

const lines = computed<Line[]>(() => {
  const out: Line[] = [];
  let code: { raw: string[]; src: number } | null = null;
  const rawsL = raws.value;
  for (let i = 0; i < rawsL.length; i++) {
    const raw = rawsL[i];
    if (raw.trim().startsWith('```')) {
      if (code) { out.push({ kind: 'code', text: code.raw.join('\n'), src: code.src }); code = null; } else code = { raw: [], src: i };
      continue;
    }
    if (code) { code.raw.push(raw); continue; }
    if (!raw.trim()) continue;
    if (/^#{1,6}\s/.test(raw)) out.push({ kind: 'h', text: raw.replace(/^#{1,6}\s+/, ''), src: i });
    else if (/^\s*[-*]\s/.test(raw)) out.push({ kind: 'li', text: raw.replace(/^\s*[-*]\s+/, ''), src: i });
    else out.push({ kind: 'p', text: raw, src: i });
  }
  if (code) out.push({ kind: 'code', text: code.raw.join('\n'), src: code.src });
  return out;
});

// Un autre document ou une mise à jour du même fichier invalident la sélection en cours.
watch(() => [current.value?.path, current.value?.body], () => { sel.value = null; });
</script>

<style scoped lang="scss">
.aicard { width: 1000px; max-width: 94vw; background: #1b1b1f; }
.aihead { font-weight: 600; font-size: 16px; }
.aibody { display: flex; flex-direction: column; gap: 12px; }
.cmp { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.cap { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
.pane { margin: 4px 0 0; padding: 10px; max-height: 340px; overflow: auto; white-space: pre-wrap; font-size: 12px; background: #141416; border-radius: 8px; span { display: block; } .add { background: rgba(80, 200, 120, .18); } .rem { background: rgba(230, 90, 90, .18); } }
.fail-text { color: #ff8a80; margin: 0; }
.page { height: calc(100vh - 56px); }
.empty { max-width: 520px; margin: 80px auto; display: flex; flex-direction: column; gap: 12px; align-items: flex-start; p { color: var(--muted-2); margin: 0; } }
.layout { display: flex; height: 100%; overflow: hidden; }
.types { flex: 0 0 220px; box-sizing: border-box; background: var(--panel); border-right: 1px solid var(--line); padding: 16px 12px; display: flex; flex-direction: column; gap: 2px; .h { padding: 0 8px 6px; } }
.type { display: flex; align-items: center; min-height: 44px; padding: 0 10px; border-radius: 8px; font-size: 13px; background: none; border: 0; color: var(--text); cursor: pointer; text-align: left; &:hover { background: var(--panel-2); } &.sel { background: #232327; box-shadow: inset 0 0 0 1px var(--line-2); } }
.grow { flex: 1; }
.add { margin: 0 8px 10px; justify-content: center; }
.add-type { margin: 6px 8px 0; justify-content: center; }
.typecard { max-width: 520px; }
.drop-err { margin: 6px 8px 0; font-size: 12px; }
.type.drop { outline: 2px dashed var(--clay); outline-offset: -2px; background: var(--panel-2); }
.type.wait .n { color: var(--clay); }
.mono-cmd :deep(input) { font-family: 'JetBrains Mono', 'SF Mono', Menlo, monospace; font-size: 12px; }
.n { font-size: 12px; color: var(--muted); }
.list { flex: 0 0 420px; box-sizing: border-box; border-right: 1px solid var(--line); padding: 12px; display: flex; flex-direction: column; gap: 4px; overflow: auto; }
.doc { display: flex; flex-direction: column; gap: 4px; padding: 12px; border-radius: 10px; background: none; border: 0; color: var(--text); cursor: pointer; text-align: left; &:hover { background: var(--panel-2); } &.sel { background: #232327; box-shadow: inset 0 0 0 1px var(--line-2); } }
.row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.path { font-size: 11px; color: var(--muted); }
.meta { font-size: 12px; color: var(--muted-2); }
.preview { flex: 1 1 0; min-width: 0; overflow: auto; padding: 20px 28px; display: flex; flex-direction: column; gap: 16px; }
.doc-title { font-size: 20px; font-weight: 600; flex: 1 1 280px; }
.body { max-width: 720px; padding: 20px 24px; gap: 10px; h3 { font-size: 15px; font-weight: 600; margin: 6px 0 0; } p { margin: 0; color: #d6d3cc; } .li { padding-left: 14px; position: relative; &::before { content: '·'; position: absolute; left: 2px; } } }
.code { margin: 0; font-size: 12px; color: var(--blue); background: var(--bg); border-radius: 8px; padding: 8px 12px; white-space: pre; overflow: auto; }
.muted { color: var(--muted-2); }
</style>
