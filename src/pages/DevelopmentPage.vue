<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import DraftPane from '../components/DraftPane.vue';
import SessionPane from '../components/SessionPane.vue';
import WorkflowTree from '../components/WorkflowTree.vue';
import { useProject } from '../composables/useProject';
import { useRuns } from '../composables/useRuns';
import { useSettings } from '../composables/useSettings';
import { pendingPrompt, pendingWorkflow } from '../composables/useTickets';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import type { Session } from '../shared/types';

const MAX = 3;
const { data, decideSession, deleteEntity } = useProject();
const { liveSessions, running, start, stop, answer, finished, followOf } = useRuns();
const { loadSettings, activeModelLabel } = useSettings();
onMounted(() => { void loadSettings(); });
/**
 * Un message envoyé dans une session existante la poursuit : on n'affiche qu'une seule session.
 * Pendant l'exécution, la version en direct reprend l'historique de la session d'origine et y ajoute la suite.
 */
const sessions = computed(() => {
  const stored = data.value?.sessions ?? [];
  const following = new Map<string, string>();
  for (const l of liveSessions.value) { const p = followOf(l.id); if (p) following.set(p, l.id); }
  const live = liveSessions.value.map((l) => {
    const orig = stored.find((s) => s.path === followOf(l.id));
    if (!orig) return l;
    return { ...orig, id: l.id, status: l.status, ask: l.ask, actions: l.actions, recapLabel: l.recapLabel, recapTitle: l.recapTitle, recap: l.recap, recapNote: l.recapNote, pending: l.pending, body: [orig.body, '## Suivi : ' + l.ask, l.body].filter(Boolean).join('\n\n') };
  });
  return [...live, ...stored.filter((s) => !following.has(s.path))];
});

const drafts = ref<string[]>([]);
const draftText = ref<Record<string, string>>({});
const draftWf = ref<Record<string, string>>({});
const draftModel = ref<Record<string, string>>({});
const sending = ref(false);
const launchError = ref('');
let draftN = 0;

const open = ref<string[]>([]);
const focus = ref('');
const treeOpen = ref(true);
const off = ref<Record<string, boolean>>({});

watch(sessions, (list) => {
  if (open.value.length || drafts.value.length) return;
  if (!data.value) return;
  if (!list.length) { newDraft(); return; }
  open.value = list.slice(0, 2).map((s) => s.id);
  focus.value = open.value[0];
}, { immediate: true });

// Un ticket de la page Projet demande une session : on ouvre un brouillon déjà rempli.
watch([data, pendingPrompt], () => {
  if (!data.value || !pendingPrompt.value) return;
  const text = pendingPrompt.value;
  pendingPrompt.value = '';
  const wf = pendingWorkflow.value;
  pendingWorkflow.value = '';
  openDraft(text, wf);
}, { immediate: true });

function show(id: string) {
  if (!open.value.includes(id)) {
    if (open.value.length >= MAX) open.value.pop();
    open.value.push(id);
  }
  focus.value = id;
}

function place(id: string, at = -1) {
  const i = open.value.indexOf(id);
  if (i >= 0) open.value.splice(i, 1);
  if (at >= 0 && at <= open.value.length) open.value.splice(at, 0, id);
  else open.value.push(id);
  while (open.value.length > MAX) open.value.splice(at === 0 ? open.value.length - 1 : 0, 1);
  focus.value = id;
}

function newDraft() { openDraft(''); }
function openDraft(initial: string, wf = '', model = '') {
  const id = 'draft-' + ++draftN;
  if (initial) draftText.value[id] = initial;
  if (wf) draftWf.value[id] = wf;
  if (model) draftModel.value[id] = model;
  drafts.value.push(id);
  launchError.value = '';
  place(id, 0);
}
function removeDraft(id: string) {
  drafts.value = drafts.value.filter((d) => d !== id);
  const i = open.value.indexOf(id);
  if (i >= 0) open.value.splice(i, 1);
  if (focus.value === id) focus.value = open.value[0] ?? '';
}

function dropOn(e: DragEvent, at = -1) {
  const id = e.dataTransfer?.getData('text/session-id');
  dragging.value = false;
  if (id) place(id, at);
}
const dragging = ref(false);
function dragStart(e: DragEvent, id: string) {
  e.dataTransfer?.setData('text/session-id', id);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
}

async function send(draftId: string, text: string, workflow = '', route?: { confidence: number; text: string }, model = '') {
  if (sending.value) return;
  sending.value = true;
  launchError.value = '';
  try {
    const live = await start(text, '', '', workflow, route, model);
    const i = open.value.indexOf(draftId);
    if (i >= 0) open.value.splice(i, 1, live);
    drafts.value = drafts.value.filter((d) => d !== draftId);
    focus.value = live;
  } catch {
    launchError.value = `Impossible de lancer la session avec ${activeModelLabel.value}. Vérifie que le service est disponible et connecté.`;
  } finally {
    sending.value = false;
  }
}

// Quand une session en direct se termine, son récap vient d'être écrit dans sessions/ : on bascule sur ce fichier.
watch(finished, (f) => {
  if (!f) return;
  const i = open.value.indexOf(f.liveId);
  if (i >= 0) open.value.splice(i, 1, f.sessionId);
  if (focus.value === f.liveId) focus.value = f.sessionId;
});

const LABEL = { run: 'Travaille', wait: 'Attend ta validation', done: 'Terminé', plan: 'Plan à valider' };
const volets = computed(() => open.value.map((id) => (drafts.value.includes(id) ? { draft: true as const, id } : { draft: false as const, id, s: sessions.value.find((x) => x.id === id) })).filter((v) => v.draft || v.s));
const focused = computed(() => sessions.value.find((s) => s.id === focus.value) ?? null);

function toggle(id: string) {
  const i = open.value.indexOf(id);
  if (i >= 0) {
    open.value.splice(i, 1);
    if (focus.value === id) focus.value = open.value[0];
  } else {
    place(id);
  }
}

const decideError = ref('');
const removing = ref<Session | null>(null);
const confirm = ref(false);
async function decide(s: Session, result: '' | 'approved' | 'rejected') {
  decideError.value = '';
  const picks: Record<string, boolean> = {};
  for (const c of s.choices) for (const p of c.picks) picks[p.id] = isOff(s.id, p.id, p.off);
  try { await decideSession(s.path, result, s.choices.length ? picks : undefined); }
  catch (e) { decideError.value = e instanceof Error ? e.message : String(e); }
}
async function followUp(s: Session, text: string) {
  launchError.value = '';
  try {
    const live = await start(text, s.path, s.name, '', undefined, s.model);
    const i = open.value.indexOf(s.id);
    if (i >= 0) open.value.splice(i, 1, live);
    focus.value = live;
  } catch (e) {
    decideError.value = e instanceof Error ? e.message : "Impossible d'envoyer ce message.";
  }
}
function askRemove(s: Session) { removing.value = s; confirm.value = true; }
async function doRemove() {
  const s = removing.value;
  if (!s) return;
  await deleteEntity('session', s.path);
  const i = open.value.indexOf(s.id);
  if (i >= 0 && open.value.length > 1) open.value.splice(i, 1);
  if (focus.value === s.id) focus.value = open.value[0] ?? '';
}

const isOff = (sid: string, pid: string, dflt: boolean) => off.value[sid + pid] ?? dflt;
const flip = (sid: string, pid: string, dflt: boolean) => { off.value[sid + pid] = !isOff(sid, pid, dflt); };
</script>

<template>
  <div class="dev">
    <nav class="list" aria-label="Sessions">
      <div class="listhead">
        <span class="h">Sessions</span>
        <button class="plus" aria-label="Nouvelle session" title="Nouvelle session" @click="newDraft">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M7 1v12M1 7h12" /></svg>
        </button>
      </div>
      <div
        v-for="(d, n) in drafts" :key="d" class="srow" :class="{ sel: open.includes(d) }"
        draggable="true" @dragstart="dragStart($event, d)"
      >
        <button class="sbtn" :aria-pressed="open.includes(d)" @click="toggle(d)">
          <span class="line">
            <span class="dot todo" aria-hidden="true" />
            <strong>Nouvelle session {{ n + 1 }}</strong>
            <span class="mono slot">{{ open.includes(d) ? 'Volet ' + (open.indexOf(d) + 1) : '' }}</span>
          </span>
          <span class="state">Pas encore lancée</span>
        </button>
        <button class="iconbtn" :aria-label="'Supprimer la nouvelle session ' + (n + 1)" title="Supprimer" @click="removeDraft(d)"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9h6.6L12 4M6.5 7v3.5M9.5 7v3.5" /></svg></button>
      </div>
      <div
        v-for="s in sessions" :key="s.id" class="srow" :class="{ sel: open.includes(s.id) }"
        draggable="true" @dragstart="dragStart($event, s.id)"
      >
        <button class="sbtn" :aria-pressed="open.includes(s.id)" @click="toggle(s.id)">
          <span class="line">
            <span class="dot" :class="s.status" aria-hidden="true" />
            <strong>{{ s.name }}</strong>
            <span class="mono slot">{{ open.includes(s.id) ? 'Volet ' + (open.indexOf(s.id) + 1) : '' }}</span>
          </span>
          <span class="task">{{ s.task }}</span>
          <span class="state">{{ LABEL[s.status] }}</span>
          <span v-if="s.status === 'run'" class="track" aria-hidden="true"><i /></span>
        </button>
        <button v-if="s.id.startsWith('live-') && s.status === 'run'" class="iconbtn" :aria-label="'Arrêter ' + s.name" title="Arrêter" @click="stop(s.id)"><svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><rect x="3" y="3" width="8" height="8" rx="1.5" /></svg></button>
        <button v-else-if="s.path.startsWith('sessions/')" class="iconbtn" :aria-label="'Supprimer ' + s.name" title="Supprimer" @click="askRemove(s)"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9h6.6L12 4M6.5 7v3.5M9.5 7v3.5" /></svg></button>
      </div>
      <span class="hint">Clique ou glisse une session vers un volet. Trois volets au maximum.</span>
    </nav>

    <div class="center">
      <div class="panes" :class="{ over: dragging }" @dragover.prevent="dragging = true" @dragleave.self="dragging = false" @drop.prevent="dropOn($event)">
        <div v-if="!volets.length" class="dropzone">Glisse une session ici, ou clique + pour en créer une.</div>
        <div v-for="(v, i) in volets" :key="v.id" class="slotbox" @dragover.prevent @drop.prevent.stop="dropOn($event, i)">
          <DraftPane
            v-if="v.draft" :initial="draftText[v.id]" :initial-workflow="draftWf[v.id]" :initial-model="draftModel[v.id]" :focused="focus === v.id" :busy="sending" :error="launchError"
            @focus="focus = v.id" @close="toggle(v.id)" @send="(t, w, r, m) => send(v.id, t, w, r, m)"
          />
          <SessionPane
            v-else :session="v.s!" :focused="focus === v.id"
            @focus="focus = v.id" @close="toggle(v.id)" @decide="decide(v.s!, $event)" @ask="followUp(v.s!, $event)" @answer="(id, allow) => answer(v.s!.id, id, allow)"
          />
        </div>
      </div>

      <section v-if="focused" class="wf" aria-label="Workflow">
        <div class="wfhead">
          <strong>Workflow de {{ focused.name }}</strong>
          <div class="legend">
            <span><span class="dot plan" />Prévu</span>
            <span><span class="dot run" />En cours</span>
            <span><span class="dot done" />Fait</span>
            <span><span class="dot wait" />Attend ta validation</span>
            <span><svg width="22" height="8" aria-hidden="true"><path d="M0 4h22" stroke="#FCA5A5" stroke-width="2" stroke-dasharray="6 4" /></svg>Lien d'échec</span>
            <span><svg width="22" height="8" aria-hidden="true"><path d="M0 4h22" stroke="#FCD34D" stroke-width="2" stroke-dasharray="2 4" /></svg>Lien bloqué</span>
            <span><span class="dot alert" />Alerte pour toi</span>
          </div>
          <button class="btn" :aria-expanded="treeOpen" @click="treeOpen = !treeOpen">{{ treeOpen ? "Replier l'arbre" : "Déplier l'arbre" }}</button>
        </div>

        <div v-if="treeOpen">
          <template v-if="focused.status === 'plan'">
            <div class="planbar">
              <span>Le routeur propose le squelette {{ focused.workflow }} (confiance {{ focused.confidence }} %). Le planificateur a rempli les emplacements adaptatifs. Retire ou ajoute des briques, puis lance.</span>
              <template v-if="focused.decisionResult">
                <span class="banner" :class="focused.decisionResult === 'approved' ? 'ok' : 'fail'">
                  Plan {{ focused.decisionResult === 'approved' ? 'validé' : 'refusé' }}. Le lancement viendra avec le moteur de workflow.
                </span>
                <button class="btn big" @click="decide(focused, '')">Annuler</button>
              </template>
              <template v-else>
                <button class="btn ok big" :disabled="!focused.path.startsWith('sessions/')" @click="decide(focused, 'approved')">Valider le plan</button>
                <button class="btn danger big" :disabled="!focused.path.startsWith('sessions/')" @click="decide(focused, 'rejected')">Refuser le plan</button>
              </template>
            </div>
            <p v-if="decideError" class="err pad" role="alert">{{ decideError }}</p>
            <div v-if="focused.choices.length" class="choices">
              <strong>Briques choisies par le planificateur</strong>
              <div v-for="c in focused.choices" :key="c.node" class="choice">
                <span class="cn">{{ c.node }}</span>
                <div class="picks">
                  <button
                    v-for="p in c.picks" :key="p.id" class="pick" :class="{ off: isOff(focused.id, p.id, p.off) }"
                    :aria-pressed="!isOff(focused.id, p.id, p.off)" @click="flip(focused.id, p.id, p.off)"
                  >
                    <span><span class="k">{{ p.kind }}</span> {{ p.label }}</span>
                    <span class="why">{{ isOff(focused.id, p.id, p.off) ? 'écartée' : p.why }}</span>
                  </button>
                </div>
              </div>
              <span class="hint">Clique une brique pour la retirer ou la remettre. Les pointillés sont des propositions écartées.</span>
            </div>
          </template>
          <div class="scroll"><WorkflowTree :session="focused" /></div>
        </div>
      </section>
    </div>
    <ConfirmDialog v-model="confirm" title="Supprimer cette session ?" :message="removing ? removing.name + ' (' + removing.path + ')' : ''" :on-confirm="doRemove" />
  </div>
</template>

<style scoped lang="scss">
:where(button:not(.btn, .chipb)) { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; text-align: left; padding: 0; }
.empty { padding: 32px; color: var(--muted); }
.dev { display: flex; height: calc(100vh - 56px); min-height: 0; overflow: hidden; }
.list { flex: 0 0 264px; box-sizing: border-box; background: var(--panel); border-right: 1px solid var(--line); padding: 16px 12px; display: flex; flex-direction: column; gap: 8px; overflow: auto; }
.list .h { padding: 0 8px; }
.listhead { display: flex; align-items: center; justify-content: space-between; padding: 0 4px 0 8px; }
.plus { width: 40px; height: 40px; border-radius: 8px; border: 1px solid var(--line-2); display: flex; align-items: center; justify-content: center; padding: 0; &:hover { background: var(--panel-2); } }
.sbtn { display: flex; flex-direction: column; gap: 6px; flex: 1; min-width: 0; padding: 12px; text-align: left; }
.iconbtn { flex: none; width: 36px; height: 36px; margin: 6px 4px 0 0; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: var(--muted-2); &:hover { background: #2a1717; color: var(--fail); } }
.slotbox { flex: 1 1 0; min-width: 0; min-height: 0; display: flex; overflow: hidden; }
.dropzone { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--muted); background: var(--bg); font-size: 13px; padding: 24px; text-align: center; }
.panes.over { outline: 2px dashed var(--clay); outline-offset: -4px; }
.launch textarea { box-sizing: border-box; width: 100%; resize: vertical; min-height: 64px; background: var(--bg); border: 1px solid var(--line-2); border-radius: 8px; color: var(--text); font: inherit; font-size: 13px; padding: 8px 10px; }
.launch .btn[disabled] { opacity: .4; cursor: default; }
.launch .stop { height: 36px; font-size: 12px; }
.small:not(.btn) { font-size: 12px; color: var(--muted); }
.err { font-size: 12px; color: var(--fail); &.pad { margin: 0 16px 8px; } }
.srow {
  display: flex; align-items: flex-start; min-height: 76px; border-radius: 10px;
  &:hover { background: #1f1f23; }
  &.sel { background: #232327; box-shadow: inset 0 0 0 1px var(--line-2); }
}
.line { display: flex; align-items: center; gap: 10px; min-width: 0; strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } }
.slot { margin-left: auto; font-size: 11px; color: var(--clay); white-space: nowrap; flex: none; }
.task { font-size: 13px; color: var(--muted-2); }
.state { font-size: 12px; color: var(--muted); }
.hint { font-size: 12px; color: var(--muted); padding: 0 8px; margin-top: auto; }
.track { height: 2px; background: #2b2b31; overflow: hidden; position: relative; border-radius: 2px; }
.track i { position: absolute; top: 0; bottom: 0; left: 0; width: 30%; background: #4ade80; animation: slide 1.4s infinite ease-in-out; }
@keyframes slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(340%); } }
@media (prefers-reduced-motion: reduce) { .track i { animation: none; } }
.center { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
.panes { flex: 1 1 0; min-height: 0; display: flex; gap: 1px; background: var(--line); overflow: hidden; }
.wf { flex: none; background: var(--panel); border-top: 1px solid var(--line); max-height: 55%; overflow: auto; }
.wfhead { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 20px; padding: 6px 16px; min-height: 48px; box-sizing: border-box; }
.legend { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 12px; color: var(--muted-2); flex: 1 1 auto; }
.legend > span { display: flex; align-items: center; gap: 6px; }
.big { height: 44px; padding: 0 16px; border-radius: 10px; }
.planbar { margin: 0 16px 8px; padding: 10px 14px; border-radius: 10px; background: #101b2b; border: 1px solid #2f4a73; display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; color: var(--blue); font-size: 13px; > span { flex: 1 1 320px; } }
.choices { margin: 0 16px 8px; padding: 12px 14px; border-radius: 10px; background: var(--panel); border: 1px solid #2f4a73; display: flex; flex-direction: column; gap: 10px; font-size: 13px; }
.choice { display: flex; flex-direction: column; gap: 6px; }
.cn { font-size: 12px; color: var(--muted); }
.picks { display: flex; flex-wrap: wrap; gap: 6px 8px; }
.pick { min-height: 44px; padding: 4px 12px; border-radius: 10px; border: 1px solid #2f4a73; background: #101b2b; display: flex; flex-direction: column; font-size: 13px; &.off { background: transparent; border-color: var(--line-2); opacity: .6; } }
.k { color: var(--muted); }
.why { font-size: 11px; color: var(--muted-2); }
.scroll { overflow: auto; padding: 4px 16px 16px; }
</style>
