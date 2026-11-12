<template>
  <q-page class="page">
    <div v-if="!data || !data.exists" class="empty">
      <span class="h">Fichiers</span>
      <p>Aucun dossier de projet n'est ouvert.</p>
      <button class="btn main" @click="choose">Choisir le dossier du projet</button>
    </div>

    <div v-else class="layout">
      <aside class="tree" aria-label="Arborescence des fichiers">
        <span class="treerow">
          <span class="h">Fichiers</span>
        </span>
        <p v-if="!entries.length" class="muted">Aucun fichier visible dans ce projet.</p>
        <button
          v-for="e in visible" :key="e.path" class="frow" :class="{ sel: e.path === opened }"
          :style="{ paddingLeft: 10 + e.depth * 14 + 'px' }"
          :aria-expanded="e.dir ? isOpen(e.path) : undefined"
          :draggable="!e.dir" :title="e.dir ? null : 'Glisse vers un type de documentation pour en faire un document'"
          @click="e.dir ? toggle(e.path) : open(e.path)"
          @dragstart="!e.dir && dragRow($event, e)"
        >
          <span class="caret" aria-hidden="true">{{ e.dir ? (isOpen(e.path) ? '▾' : '▸') : '' }}</span>
          <span class="name" :class="{ dir: e.dir }">{{ baseName(e.path) }}</span>
          <span v-if="!e.dir" class="mono size">{{ sizeLabel(e.size) }}</span>
        </button>
      </aside>

      <main class="editor">
        <template v-if="opened">
          <div class="filehead">
            <span class="mono path">{{ opened }}</span>
            <span v-if="dirty" class="tag mod">Non enregistré</span>
            <span class="row-actions">
              <button class="btn small" :disabled="!dirty || busy" @click="reload">Recharger</button>
              <button class="btn small main" :disabled="!dirty || busy" @click="save">Enregistrer</button>
            </span>
          </div>

          <div class="codewrap">
            <div ref="gutter" class="gutter mono" aria-hidden="true"><span v-for="n in lineCount" :key="n">{{ n }}</span></div>
            <div class="codebox">
              <pre ref="hl" class="hl mono" aria-hidden="true"><code v-html="highlighted"></code></pre>
              <textarea
                ref="editor" v-model="content" class="text" spellcheck="false"
                :aria-label="'Contenu de ' + opened" @select="readSelection" @mouseup="readSelection" @keyup="readSelection" @scroll="syncScroll"
              />
            </div>
          </div>

          <section class="ask" aria-label="Modification par l'IA">
            <div class="askrow">
              <textarea
                v-model="instruction" class="prompt" rows="2" :disabled="aiBusy"
                placeholder="Décris la modification souhaitée (facultatif : sélectionne d'abord une partie du fichier)"
                aria-label="Consigne pour l'IA" @keydown.enter.meta.prevent="askAi(false)" @keydown.enter.ctrl.prevent="askAi(false)"
              />
              <button v-if="selLen" class="btn small" :disabled="aiBusy || busy" @click="askAi(true)">{{ proposal ? 'Refaire la sélection' : 'Modifier la sélection' }}</button>
              <button v-else class="btn small" :disabled="aiBusy || busy" @click="askAi(false)">{{ proposal ? 'Refaire le fichier' : 'Proposer une modification' }}</button>
            </div>
            <p v-if="selLen" class="meta">Sélection : {{ selLines }} ligne{{ selLines > 1 ? 's' : '' }}, {{ selLen }} caractères. Seule cette partie sera remplacée.</p>
            <p v-if="aiBusy" class="wait" role="status">Le modèle lit le fichier et propose une modification.</p>
            <p v-if="error" class="err" role="alert">{{ error }}</p>
            <template v-if="proposal">
              <p class="meta">{{ added }} ligne{{ added > 1 ? 's' : '' }} ajoutée{{ added > 1 ? 's' : '' }}, {{ removed }} retirée{{ removed > 1 ? 's' : '' }}. Vérifie avant d'appliquer : rien n'est écrit avant confirmation.</p>
              <pre class="out mono">{{ proposal }}</pre>
              <div class="acts">
                <button class="btn small main" @click="apply">Appliquer dans l'éditeur</button>
                <button class="btn small" @click="proposal = ''">Rejeter</button>
              </div>
            </template>
          </section>
        </template>
        <p v-else class="muted center">Choisis un fichier dans l'arborescence.</p>
      </main>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useProject } from '../composables/useProject';
import { highlight } from '../shared/highlight';
import type { FileEntry } from '../shared/types';

const { data, choose } = useProject();

const entries = ref<FileEntry[]>([]);
const opened = ref('');
const content = ref('');
const saved = ref('');
const dirty = computed(() => content.value !== saved.value);
const busy = ref(false);
const expanded = ref<Record<string, boolean>>({});
const editor = ref<HTMLTextAreaElement | null>(null);
const hl = ref<HTMLElement | null>(null);
const gutter = ref<HTMLElement | null>(null);

const lineCount = computed(() => content.value.split('\n').length);
const highlighted = computed(() => (opened.value ? highlight(content.value, opened.value) : '') + '\n');

function syncScroll() {
  const el = editor.value;
  if (!el) return;
  if (hl.value) { hl.value.scrollTop = el.scrollTop; hl.value.scrollLeft = el.scrollLeft; }
  if (gutter.value) gutter.value.scrollTop = el.scrollTop;
}

watch(content, () => nextTick(syncScroll));

const selStart = ref(0);
const selEnd = ref(0);
const instruction = ref('');
const aiBusy = ref(false);
const error = ref('');
const proposal = ref('');
const scope = ref<'file' | 'selection'>('file');
/** Bornes de la sélection au moment de la demande (le texte peut bouger ensuite). */
const applied = ref<{ start: number; end: number } | null>(null);

/** Un dossier est replié par défaut ; seul un clic pour le déplier l'ouvre. */
const isOpen = (p: string) => expanded.value[p] === true;

const visible = computed(() => {
  const out: FileEntry[] = [];
  let hideFrom = -1;
  for (const e of entries.value) {
    if (hideFrom >= 0 && e.depth >= hideFrom) continue;
    hideFrom = -1;
    out.push(e);
    if (e.dir && !isOpen(e.path)) hideFrom = e.depth + 1;
  }
  return out;
});

const selText = computed(() => content.value.slice(selStart.value, selEnd.value));
const selLen = computed(() => selEnd.value - selStart.value);
const selLines = computed(() => selText.value.split('\n').length);

const curLines = computed(() => (scope.value === 'selection' && applied.value ? content.value.slice(applied.value.start, applied.value.end) : saved.value).split('\n'));
const newLines = computed(() => (proposal.value || '').split('\n'));
const curSet = computed(() => new Set(curLines.value));
const newSet = computed(() => new Set(newLines.value));
const added = computed(() => newLines.value.filter((l) => l.trim() && !curSet.value.has(l)).length);
const removed = computed(() => curLines.value.filter((l) => l.trim() && !newSet.value.has(l)).length);

const baseName = (p: string) => p.slice(p.lastIndexOf('/') + 1);
const sizeLabel = (n: number) => (n < 1024 ? n + ' o' : Math.round(n / 102.4) / 10 + ' ko');

/** L'interface montre tout ce que le processus principal renvoie, y compris les dossiers cachés. */
async function loadTree() {
  try { entries.value = await window.api.listFileTree(); } catch { entries.value = []; }
}

function toggle(path: string) {
  expanded.value = { ...expanded.value, [path]: !isOpen(path) };
}

/** Glisser un fichier vers un type de documentation en cours d'exécution n'arrive que si les deux sont visibles ;
 * on transporte simplement le chemin (relatif au projet, résolu par le processus principal). */
function dragRow(e: DragEvent, f: FileEntry) {
  e.dataTransfer?.setData('text/fichier-path', f.path);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
}

async function open(path: string) {
  if (dirty.value && !window.confirm('Ce fichier n\'est pas enregistré. Ouvrir un autre fichier quand même ?')) return;
  busy.value = true;
  error.value = '';
  proposal.value = '';
  try {
    const f = await window.api.readProjectFile(path);
    opened.value = f.path;
    content.value = f.content;
    saved.value = f.content;
    selStart.value = 0;
    selEnd.value = 0;
    nextTick(() => { syncScroll(); editor.value?.focus(); });
  } catch (e) {
    error.value = clean(e);
  } finally { busy.value = false; }
}

async function reload() {
  if (!opened.value) return;
  try {
    const f = await window.api.readProjectFile(opened.value);
    content.value = f.content;
    saved.value = f.content;
    proposal.value = '';
  } catch (e) { error.value = clean(e); }
}

async function save() {
  if (!opened.value || !dirty.value) return;
  busy.value = true;
  error.value = '';
  try {
    await window.api.writeProjectFile(opened.value, content.value);
    saved.value = content.value;
  } catch (e) { error.value = clean(e); }
  finally { busy.value = false; }
}

function readSelection() {
  const el = editor.value;
  if (!el) return;
  selStart.value = el.selectionStart;
  selEnd.value = el.selectionEnd;
}

async function askAi(selection: boolean) {
  if (!opened.value || !instruction.value.trim()) { error.value = 'Décris la modification souhaitée.'; return; }
  const wasOpen = proposal.value !== '';
  scope.value = selection ? 'selection' : 'file';
  applied.value = selection ? { start: selStart.value, end: selEnd.value } : null;
  aiBusy.value = true;
  error.value = '';
  proposal.value = '';
  try {
    const text = await window.api.suggestFileEdit({
      path: opened.value,
      content: content.value,
      instruction: instruction.value,
      selection: selection ? { start: selStart.value, end: selEnd.value, text: selText.value } : undefined
    });
    proposal.value = text;
  } catch (e) {
    error.value = clean(e);
    if (wasOpen) proposal.value = '';
  } finally { aiBusy.value = false; }
}

function apply() {
  if (!proposal.value) return;
  const s = applied.value;
  content.value = s ? content.value.slice(0, s.start) + proposal.value + content.value.slice(s.end) : proposal.value;
  proposal.value = '';
  instruction.value = '';
  applied.value = null;
}

const clean = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']*': (Error: )?/, '');

void loadTree();
watch(() => data.value?.root, () => {
  opened.value = '';
  content.value = '';
  saved.value = '';
  proposal.value = '';
  error.value = '';
  void loadTree();
});
</script>

<style scoped lang="scss">
.page { height: calc(100vh - 56px); }
.layout { display: flex; height: 100%; overflow: hidden; }
.tree { flex: 0 0 280px; box-sizing: border-box; background: var(--panel); border-right: 1px solid var(--line); padding: 16px 8px; display: flex; flex-direction: column; gap: 1px; overflow: auto; .h { padding: 0 8px 8px; } }
.treerow { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 8px 8px; }
.frow { display: flex; align-items: center; gap: 4px; min-height: 30px; padding-right: 8px; border: 0; border-radius: 6px; background: none; color: var(--text); font: inherit; font-size: 13px; cursor: pointer; text-align: left; &:hover { background: var(--panel-2); } &.sel { background: #232327; box-shadow: inset 0 0 0 1px var(--line-2); } }
.caret { width: 12px; flex: none; color: var(--muted); font-size: 10px; }
.name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; &.dir { font-weight: 600; } }
.size { margin-left: auto; flex: none; font-size: 11px; color: var(--muted); }
.editor { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 12px; padding: 16px 20px; overflow: auto; }
.row-actions { display: flex; align-items: center; gap: 8px; flex: none; }
.path { font-size: 13px; color: var(--muted-2); flex: 1 1 200px; overflow: hidden; text-overflow: ellipsis; }
.tag.mod { background: var(--warn); color: #1a1a10; }
.codewrap { flex: 1 1 320px; min-height: 260px; display: flex; background: var(--panel); border: 1px solid var(--line-2); border-radius: 12px; overflow: hidden; }
.gutter { flex: none; width: 48px; box-sizing: border-box; padding: 14px 8px 14px 0; text-align: right; color: var(--muted); font-size: 13px; line-height: 1.6; user-select: none; overflow: hidden; background: var(--bg); border-right: 1px solid var(--line); span { display: block; } }
.codebox { position: relative; flex: 1; min-width: 0; }
.hl, .text { position: absolute; inset: 0; margin: 0; padding: 14px; box-sizing: border-box; font-family: 'JetBrains Mono', 'SF Mono', Menlo, monospace; font-size: 13px; line-height: 1.6; white-space: pre-wrap; overflow-wrap: break-word; overflow: auto; }
.hl { color: var(--text); pointer-events: none; & :deep(.kw) { color: var(--clay); } & :deep(.str) { color: var(--ok); } & :deep(.cm) { color: var(--muted); font-style: italic; } & :deep(.num) { color: var(--warn); } & :deep(.tk) { color: var(--blue); } }
.text { z-index: 1; width: 100%; height: 100%; resize: none; border: 0; outline: 0; background: transparent; color: transparent; caret-color: var(--text); &::selection { background: #3d5a80; color: transparent; } }
.ask { display: flex; flex-direction: column; gap: 8px; border-top: 1px solid var(--line); padding-top: 12px; }
.askrow { display: flex; gap: 8px; align-items: flex-start; }
.prompt { flex: 1; min-width: 0; resize: vertical; min-height: 44px; box-sizing: border-box; background: var(--bg); border: 1px solid var(--line-2); border-radius: 8px; color: var(--text); font: inherit; font-size: 13px; padding: 8px 10px; &:focus { outline: 0; border-color: var(--clay); } &:disabled { color: var(--muted); } }
.wait { margin: 0; font-size: 12px; color: var(--muted-2); }
.err { margin: 0; font-size: 12px; color: var(--fail); }
.meta { margin: 0; font-size: 12px; color: var(--muted-2); }
.out { margin: 0; max-height: 300px; overflow: auto; white-space: pre; font-size: 12px; line-height: 1.5; color: var(--blue); background: var(--bg); border-radius: 8px; padding: 10px 12px; }
.acts { display: flex; gap: 8px; }
.muted { color: var(--muted-2); }
.center { margin: auto; }
.empty { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; p { margin: 0; color: var(--muted-2); } }
</style>
