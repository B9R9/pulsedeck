<template>
  <q-page class="page">
    <div v-if="!data || !data.exists" class="empty">
      <span class="h">Projet</span>
      <p>Aucun dossier de projet n'est ouvert. Choisis un dossier qui contient cycles/, feats/, pulses/, docs/.</p>
      <button class="btn main" @click="choose">Choisir le dossier du projet</button>
    </div>

    <div v-else class="wrapper">
      <div class="topbar">
        <span class="pname">{{ projectName }}</span>
        <div v-for="g in tabGroups" :key="g.label" class="tabgroup" role="group" :aria-label="g.label">
          <span class="glabel">{{ g.label }}</span>
          <div class="tabs" role="tablist">
            <button
              v-for="t in g.tabs" :key="t.id" class="tab" :class="{ sel: tab === t.id }" role="tab"
              :aria-selected="tab === t.id" @click="tab = t.id"
            >{{ t.label }}<span class="n">{{ t.count }}</span></button>
          </div>
        </div>
        <span class="grow" />
        <template v-if="tab === 'cycles'">
          <button class="btn" @click="openCycle(null)">Nouveau cycle</button>
          <button class="btn main" @click="openFeat(null)">Nouvelle feat</button>
        </template>
        <template v-else-if="tab === 'tickets'">
          <button class="btn main" @click="startCreate">Nouveau ticket</button>
          <button class="btn" @click="reloadTickets">Actualiser</button>
          <button class="btn" @click="chooseFile">Choisir le fichier</button>
        </template>
        <button v-else-if="tab === 'memory'" class="btn main" @click="openNote(null)">Nouvelle entrée</button>
      </div>

      <div class="scroll">
        <p v-if="failed" class="banner fail" role="alert">{{ failed }}</p>

        <div v-if="tab === 'cycles'" class="content">
          <p class="intro">
            <span><b>Feat</b> : un résultat à livrer</span>
            <span><b>Cycle</b> : une période qui contient des feats</span>
            <span><b>Pulse</b> : la plus petite unité, finie par un workflow dans une session</span>
          </p>
          <div v-if="!groups.length" class="card emptycard">Aucun cycle pour l'instant. Commence par « Nouveau cycle ».</div>

          <section v-for="c in groups" :key="c.id" class="cycle" :aria-label="c.title">
            <div class="cycle-head">
              <span class="title">{{ c.title }}</span>
              <span v-if="c.period" class="tag">{{ c.period }}</span>
              <span v-if="c.state" class="tag ok">{{ c.state }}</span>
              <span class="mono file">{{ c.file }}</span>
              <span v-if="c.file" class="icons">
                <button class="ic" :aria-label="'Modifier ' + c.title" title="Modifier" @click="openCycle(c)"><svg v-bind="ICON"><path :d="PEN" /></svg></button>
                <button class="ic del" :aria-label="'Supprimer ' + c.title" title="Supprimer" @click="askDelete('cycle', c.file, c.title)"><svg v-bind="ICON"><path :d="TRASH" /></svg></button>
              </span>
            </div>

            <article v-for="f in c.feats" :key="f.id" class="card feat">
              <div class="feat-head">
                <span class="mono id">{{ f.id }}</span>
                <span class="title">{{ f.title }}</span>
                <span class="count">{{ f.done }} sur {{ f.pulses.length }} pulses</span>
                <button class="btn small" :disabled="splitting === f.id" @click="doSplit(f)">{{ splitting === f.id ? 'Le modèle réfléchit…' : 'Découper avec l\'IA' }}</button>
                <span class="icons">
                  <button class="ic" :aria-label="'Modifier ' + f.title" title="Modifier" @click="openFeat(f)"><svg v-bind="ICON"><path :d="PEN" /></svg></button>
                  <button class="ic del" :aria-label="'Supprimer ' + f.title" title="Supprimer" @click="askDelete('feat', f.file, f.title)"><svg v-bind="ICON"><path :d="TRASH" /></svg></button>
                </span>
              </div>
              <div class="bar"><div class="fill" :style="{ width: f.pct + '%' }" /></div>
              <div class="goal">
                <span>{{ f.goal }}</span>
                <router-link v-if="f.specTitle" class="tag blue" :to="{ name: 'documentation' }">Spec : {{ f.specTitle }}</router-link>
              </div>
              <div v-if="f.parent || f.docs.length" class="links">
                <span v-if="f.parent" class="tag blue">Parent : {{ f.parent }}</span>
                <span v-for="d in f.docs" :key="d" class="tag">{{ d }}</span>
              </div>
              <div class="pulses">
                <div v-for="p in f.pulses" :key="p.id" class="pulse">
                  <span class="dot" :class="p.state" aria-hidden="true" />
                  <span class="mono id">{{ p.id }}</span>
                  <span class="pt">{{ p.title }}</span>
                  <span class="tag blue">{{ p.workflow }}</span>
                  <span class="state">{{ labels[p.state] }}</span>
                  <span v-if="p.docs.length" class="tag" :title="p.docs.join(', ')">{{ p.docs.length }} doc{{ p.docs.length > 1 ? 's' : '' }}</span>
                  <button v-if="QUICK[p.state]" class="btn small" :class="{ ok: p.state !== 'done' }" @click="quick(p)">{{ QUICK[p.state]!.label }}</button>
                  <span class="icons">
                    <button class="ic" :aria-label="'Modifier ' + p.title" title="Modifier" @click="openPulse(p, f.id)"><svg v-bind="ICON"><path :d="PEN" /></svg></button>
                    <button class="ic del" :aria-label="'Supprimer ' + p.title" title="Supprimer" @click="askDelete('pulse', p.file, p.title)"><svg v-bind="ICON"><path :d="TRASH" /></svg></button>
                  </span>
                </div>
                <button class="addpulse" @click="openPulse(null, f.id)">+ Ajouter un pulse</button>
              </div>
              <span class="mono file">{{ f.file }}</span>
            </article>
          </section>
        </div>

        <div v-else-if="tab === 'recaps'" class="content narrow">
          <p class="intro"><span>Chaque session écrit son récap en markdown dans <span class="mono">sessions/</span> : le workflow suivi, le résultat, le coût.</span></p>
          <div v-if="!recaps.length" class="card emptycard">Aucun récap pour l'instant. Lance une session dans Développement.</div>
          <article v-for="r in recaps" :key="r.path" class="card recap">
            <div class="feat-head">
              <span class="title">{{ r.task || r.name }}</span>
              <span class="tag blue">{{ r.workflow }}</span>
              <span class="tag push" :class="STATUS_CLS[r.status]">{{ STATUS[r.status] }}</span>
            </div>
            <span class="mono file">{{ r.path }}</span>
            <span class="rt">{{ r.recapTitle }}</span>
            <span class="meta">{{ r.actions }} · {{ r.tokens }} tokens · {{ r.elapsed }}</span>
            <router-link class="btn small open" :to="{ name: 'developpement' }">Ouvrir dans Développement</router-link>
          </article>
        </div>

        <div v-else-if="tab === 'tickets'" class="content wide">
          <p v-if="ticketData?.error" class="banner fail" role="alert">{{ ticketData.error }}</p>
          <p v-else-if="ticketData" class="intro">
            <span>Source : <b>{{ ORIGIN[ticketData.origin] }}</b></span>
            <span class="mono file">{{ ticketData.file }}</span>
            <span v-if="ticketData.exportedAt">Exporté le {{ fmt(ticketData.exportedAt) }}</span>
            <span>Relu le {{ fmt(ticketData.readAt) }}</span>
          </p>
          <div class="filters">
            <input v-model="q" class="search" type="search" placeholder="Rechercher un ticket" aria-label="Rechercher un ticket">
            <button v-for="c in CATS" :key="c.id" class="chipb" :class="{ sel: cat === c.id }" @click="cat = c.id">{{ c.label }}<span class="n">{{ catCount(c.id) }}</span></button>
            <select v-model="proj" class="projsel" aria-label="Projet Jira">
              <option value="">Tous les projets</option>
              <option v-for="p in projects" :key="p" :value="p">{{ p }}</option>
            </select>
          </div>
          <div class="tkwrap">
          <div class="tklist">
          <div v-if="!shownTickets.length" class="card emptycard">Aucun ticket pour ce filtre.</div>
          <button v-for="t in shownTickets" :key="t.key" class="card tk" :class="{ on: sel === t.key }" @click="select(t)">
            <span class="mono id">{{ t.key }}</span>
            <span class="tt">{{ t.summary }}</span>
            <span v-if="t.isLocal" class="tag blue">Local</span>
            <span v-else-if="t.local?.length" class="tag hint">Modifié</span>
            <span v-if="t.type" class="tag">{{ t.type }}</span>
            <span class="tag" :class="CAT_CLS[t.statusCategory ?? ''] ?? ''">{{ t.status }}</span>
            <span v-if="t.priority" class="state">{{ t.priority }}</span>
          </button>
          <p v-if="hiddenCount > 0" class="intro">{{ hiddenCount }} autres tickets : affine la recherche.</p>
          </div>

          <aside v-if="sel || creating" class="card tkdetail" aria-label="Détail du ticket">
            <div class="feat-head">
              <span class="mono id">{{ creating ? 'Nouveau ticket' : sel }}</span>
              <span v-if="current?.isLocal" class="tag blue">Créé dans l'app</span>
              <span class="grow" />
              <button class="ic" aria-label="Fermer le détail" title="Fermer" @click="closeDetail">✕</button>
            </div>
            <q-input v-model="ed.summary" label="Titre" outlined dark dense autogrow />
            <AiSuggest kind="ticket" field="summary" :context="aiContext('summary')" :current="ed.summary" @use="ed.summary = $event" />
            <q-input v-model="ed.description" label="Description" type="textarea" outlined dark autogrow :input-style="{ minHeight: '110px' }" />
            <AiSuggest kind="ticket" field="description" :context="aiContext('description')" :current="ed.description" @use="ed.description = $event" />
            <div class="two">
              <q-select v-model="ed.status" :options="statusOpts" label="Statut" outlined dark dense options-dense popup-content-class="dlg-menu" />
              <q-select v-model="ed.priority" :options="ticketData?.priorities ?? []" label="Priorité" outlined dark dense options-dense popup-content-class="dlg-menu" />
              <q-select v-model="ed.type" :options="ticketData?.types ?? []" label="Type" outlined dark dense options-dense popup-content-class="dlg-menu" />
              <q-input v-model="ed.assignee" label="Assigné à" outlined dark dense />
            </div>
            <template v-if="!creating">
              <q-select v-model="ed.parent" :options="parentOptions" label="Parent" emit-value map-options outlined dark dense options-dense clearable popup-content-class="dlg-menu" />
              <q-select v-model="ed.docs" :options="docOptions" label="Documents liés" emit-value map-options multiple use-chips outlined dark dense options-dense popup-content-class="dlg-menu" />
              <div v-if="children.length" class="kids">
                <span class="glabel">Enfants</span>
                <span v-for="k in children" :key="k.id" class="tag">{{ k.id }} · {{ k.title }}</span>
              </div>
              <p v-if="current && !current.isLocal && current.local?.length" class="intro"><span>Modifié dans l'app : {{ current.local.join(', ') }}. Le fichier Drive n'est pas changé.</span></p>
              <p v-if="current" class="meta">Créé le {{ fmt(current.created) }} · Mis à jour le {{ fmt(current.updated) }}</p>
            </template>
            <p v-if="edError" class="banner fail" role="alert">{{ edError }}</p>
            <div class="actions">
              <button v-if="current && !current.isLocal && current.local?.length" class="btn small" @click="doReset">Annuler mes modifications</button>
              <button v-if="current?.isLocal" class="btn small del" @click="doDeleteLocal">Supprimer</button>
              <span class="grow" />
              <button v-if="current" class="btn small" @click="startFromTicket(current)">Lancer une session</button>
              <button class="btn small main" @click="saveDetail">{{ creating ? 'Créer' : 'Enregistrer' }}</button>
            </div>
          </aside>
          </div>
        </div>

        <div v-else class="content narrow">
          <p class="intro"><span>Ce que les agents savent de ce projet. Rien n'y entre sans ton accord.</span></p>
          <div v-if="!notes.length" class="card emptycard">La mémoire est vide.</div>
          <article v-for="n in notes" :key="n.path" class="card note">
            <div class="feat-head">
              <span class="title">{{ n.title }}</span>
              <span class="icons">
                <button class="ic" :aria-label="'Modifier ' + n.title" title="Modifier" @click="openNote(n)"><svg v-bind="ICON"><path :d="PEN" /></svg></button>
                <button class="ic del" :aria-label="'Supprimer ' + n.title" title="Supprimer" @click="askDelete('memory', n.path, n.title)"><svg v-bind="ICON"><path :d="TRASH" /></svg></button>
              </span>
            </div>
            <MdText :text="n.body" />
            <span class="mono file">{{ n.path }}</span>
          </article>
        </div>
      </div>
    </div>

    <q-dialog v-model="splitOpen">
      <q-card class="dlgcard" dark>
        <q-card-section class="dlghead">Découpage proposé pour {{ splitFeatId }}</q-card-section>
        <q-card-section class="dlgbody">
          <p v-if="proposal?.cycle" class="intro"><span>Nouveau cycle : <b>{{ proposal.cycle.title }}</b> ({{ proposal.cycle.period || 'sans période' }})</span></p>
          <p class="intro"><span>Chaque pulse est créé avec la feat comme parent. Retire ceux dont tu ne veux pas.</span></p>
          <div v-for="(p, i) in proposal?.pulses ?? []" :key="i" class="splitrow">
            <input v-model="p.title" class="search" :aria-label="'Titre du pulse ' + (i + 1)">
            <span class="tag blue">{{ p.workflow }}</span>
            <button class="ic del" :aria-label="'Retirer le pulse ' + (i + 1)" @click="proposal?.pulses.splice(i, 1)"><svg v-bind="ICON"><path :d="TRASH" /></svg></button>
          </div>
          <p v-if="splitError" class="banner fail" role="alert">{{ splitError }}</p>
        </q-card-section>
        <q-card-actions align="right">
          <button class="btn" @click="splitOpen = false">Annuler</button>
          <button class="btn main" :disabled="!proposal?.pulses.length" @click="confirmSplit">Créer {{ proposal?.pulses.length ?? 0 }} pulses</button>
        </q-card-actions>
      </q-card>
    </q-dialog>

    <EntityDialog v-model="dialog" :kind="target.kind" :path="target.path" :values="target.values" :body="target.body" />
    <ConfirmDialog v-model="confirm" :title="'Supprimer : ' + (removing?.title ?? '')" :message="removing?.file ?? ''" :on-confirm="doDelete" />
  </q-page>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useProject } from '../composables/useProject';
import { useTickets, pendingPrompt } from '../composables/useTickets';
import { useRouter } from 'vue-router';
import type { Ticket, SplitProposal } from '../shared/types';
import EntityDialog from '../components/EntityDialog.vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import MdText from '../components/MdText.vue';
import AiSuggest from '../components/AiSuggest.vue';
import type { Cycle, Feat, NoteFile, Pulse, PulseState, SessionStatus } from '../shared/types';
import type { EntityKind } from '../shared/entities';

const { data, choose, saveEntity, deleteEntity, splitFeat, applySplit } = useProject();

const dialog = ref(false);
const target = ref<{ kind: EntityKind; path: string | null; values: Record<string, unknown>; body: string }>({ kind: 'cycle', path: null, values: {}, body: '' });
const confirm = ref(false);
const removing = ref<{ kind: EntityKind; file: string; title: string } | null>(null);
const failed = ref('');
const tab = ref<'cycles' | 'recaps' | 'tickets' | 'memory'>('cycles');

const { tickets: ticketData, reload: reloadTickets, chooseFile, linkTicket, saveTicket, resetTicket, createTicket, deleteTicket } = useTickets();
const router = useRouter();
function startFromTicket(t: Ticket) {
  pendingPrompt.value = [
    `Ticket Jira ${t.key} : ${t.summary}`,
    `Type : ${t.type ?? 'inconnu'}. Statut : ${t.status ?? 'inconnu'}. Priorité : ${t.priority ?? 'non définie'}.`,
    `Lis le ticket ${t.key} dans Jira pour le détail, puis propose un plan avant de modifier quoi que ce soit.`
  ].join('\n');
  void router.push({ name: 'developpement' });
}
const parentOptions = computed(() => [
  ...(data.value?.cycles ?? []).map((c) => ({ value: c.id, label: `${c.id} · ${c.title}` })),
  ...(data.value?.feats ?? []).map((f) => ({ value: f.id, label: `${f.id} · ${f.title}` })),
  ...(data.value?.pulses ?? []).map((p) => ({ value: p.id, label: `${p.id} · ${p.title}` })),
  ...allTickets.value.filter((t) => t.key !== sel.value).map((t) => ({ value: t.key, label: `${t.key} · ${t.summary}` }))
]);
const docOptions = computed(() => (data.value?.docs ?? []).map((d) => ({ value: d.path, label: d.title || d.path })));

const sel = ref('');
const creating = ref(false);
const edError = ref('');
/** Contexte donné à l'IA pour un ticket : les autres champs, le parent et les documents liés (qu'elle peut lire). */
function aiContext(skip: 'summary' | 'description'): Record<string, string> {
  const e = ed.value;
  const parent = parentOptions.value.find((o) => o.value === e.parent)?.label ?? e.parent;
  return {
    ...(skip === 'summary' ? {} : { Titre: e.summary }),
    ...(skip === 'description' ? {} : { Description: e.description }),
    Type: e.type, Statut: e.status, Priorité: e.priority, Parent: parent,
    'Documents liés (à lire si utile)': e.docs.join(', ')
  };
}
const ed = ref({ summary: '', description: '', status: '', priority: '', type: '', assignee: '', parent: '', docs: [] as string[] });
const current = computed(() => allTickets.value.find((t) => t.key === sel.value) ?? null);
const statusOpts = computed(() => (ticketData.value?.statuses ?? []).map((x) => x.name));
const children = computed(() => {
  const k = sel.value;
  if (!k) return [];
  return [
    ...allTickets.value.filter((t) => t.parent === k).map((t) => ({ id: t.key, title: t.summary })),
    ...(data.value?.cycles ?? []).filter((x) => x.parent === k),
    ...(data.value?.feats ?? []).filter((x) => x.parent === k),
    ...(data.value?.pulses ?? []).filter((x) => x.parent === k)
  ];
});
function fill(t: Ticket | null) {
  ed.value = {
    summary: t?.summary ?? '', description: t?.description ?? '', status: t?.status ?? 'À faire', priority: t?.priority ?? 'Medium',
    type: t?.type ?? 'Task', assignee: t?.assignee ?? '', parent: t?.parent ?? '', docs: [...(t?.docs ?? [])]
  };
  edError.value = '';
}
function select(t: Ticket) { creating.value = false; sel.value = t.key; fill(t); }
function startCreate() { sel.value = ''; creating.value = true; fill(null); }
function closeDetail() { sel.value = ''; creating.value = false; }
async function saveDetail() {
  edError.value = '';
  const { parent, docs, ...fields } = ed.value;
  try {
    if (creating.value) {
      await createTicket(fields);
      const made = allTickets.value.filter((t) => t.isLocal).sort((a, b) => b.created.localeCompare(a.created))[0];
      if (made) select(made); else closeDetail();
      return;
    }
    await saveTicket(sel.value, fields);
    await linkTicket(sel.value, parent ?? '', docs);
    const t = current.value; if (t) fill(t);
  } catch (e) { edError.value = e instanceof Error ? e.message : String(e); }
}
async function doReset() {
  try { await resetTicket(sel.value); if (current.value) fill(current.value); }
  catch (e) { edError.value = e instanceof Error ? e.message : String(e); }
}
async function doDeleteLocal() {
  try { await deleteTicket(sel.value); closeDetail(); }
  catch (e) { edError.value = e instanceof Error ? e.message : String(e); }
}

const splitting = ref('');
const splitOpen = ref(false);
const splitFeatId = ref('');
const proposal = ref<SplitProposal | null>(null);
const splitError = ref('');
async function doSplit(f: Feat) {
  failed.value = ''; splitting.value = f.id;
  try { proposal.value = await splitFeat(f.id); splitFeatId.value = f.id; splitError.value = ''; splitOpen.value = true; }
  catch (e) { failed.value = e instanceof Error ? e.message : String(e); }
  finally { splitting.value = ''; }
}
async function confirmSplit() {
  if (!proposal.value) return;
  try { await applySplit(splitFeatId.value, JSON.parse(JSON.stringify(proposal.value))); splitOpen.value = false; }
  catch (e) { splitError.value = e instanceof Error ? e.message : String(e); }
}

const q = ref('');
const cat = ref<'all' | 'To Do' | 'In Progress' | 'Done'>('all');
const proj = ref('');
const LIMIT = 150;
const ORIGIN = { drive: 'Google Drive', choisi: 'Fichier choisi', projet: 'Copie dans le projet', aucun: 'Aucune' } as const;
const CATS = [
  { id: 'all' as const, label: 'Tous' },
  { id: 'To Do' as const, label: 'À faire' },
  { id: 'In Progress' as const, label: 'En cours' },
  { id: 'Done' as const, label: 'Terminés' }
];
const CAT_CLS: Record<string, string> = { 'To Do': '', 'In Progress': 'hint', Done: 'ok' };
const allTickets = computed(() => ticketData.value?.tickets ?? []);
const projects = computed(() => [...new Set(allTickets.value.map((t) => t.project))].sort());
const filteredTickets = computed(() => {
  const needle = q.value.trim().toLowerCase();
  return allTickets.value
    .filter((t) => (!proj.value || t.project === proj.value) && (cat.value === 'all' || t.statusCategory === cat.value)
      && (!needle || t.key.toLowerCase().includes(needle) || t.summary.toLowerCase().includes(needle)))
    .sort((a, b) => b.updated.localeCompare(a.updated));
});
const shownTickets = computed(() => filteredTickets.value.slice(0, LIMIT));
const hiddenCount = computed(() => filteredTickets.value.length - shownTickets.value.length);
function catCount(id: string) { return id === 'all' ? allTickets.value.length : allTickets.value.filter((t) => t.statusCategory === id).length; }
function fmt(iso: string) { return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }); }

const ICON = { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' } as const;
const PEN = 'M10.5 2.5l3 3L6 13H3v-3z M9 4l3 3';
const TRASH = 'M2.5 4h11M6 4V2.5h4V4M4 4l.7 9h6.6L12 4M6.5 7v3.5M9.5 7v3.5';

const projectName = computed(() => (data.value?.root ?? '').split(/[\\/]/).filter(Boolean).pop() ?? 'Projet');
const recaps = computed(() => [...(data.value?.sessions ?? [])].sort((a, b) => b.path.localeCompare(a.path)));
const notes = computed(() => data.value?.memory ?? []);
const tabGroups = computed(() => [
  { label: 'Gestion des tickets', tabs: [
    { id: 'cycles' as const, label: 'Cycles et feats', count: data.value?.feats.length ?? 0 },
    { id: 'tickets' as const, label: 'Jira', count: allTickets.value.length }
  ] },
  { label: 'Suivi', tabs: [
    { id: 'recaps' as const, label: 'Récaps', count: recaps.value.length },
    { id: 'memory' as const, label: 'Mémoire', count: notes.value.length }
  ] }
]);
const STATUS: Record<SessionStatus, string> = { run: 'En cours', wait: 'Attend ta validation', done: 'Terminé', plan: 'Plan à valider' };
const STATUS_CLS: Record<SessionStatus, string> = { run: 'ok', wait: 'hint', done: '', plan: 'blue' };

function openNote(n: NoteFile | null) {
  target.value = { kind: 'memory', path: n ? n.path : null, values: n ? { title: n.title } : {}, body: n ? n.body : '' };
  dialog.value = true;
}

const QUICK: Partial<Record<PulseState, { label: string; to: PulseState }>> = {
  plan: { label: 'Valider le plan', to: 'run' },
  wait: { label: 'Valider', to: 'done' },
  run: { label: 'Marquer terminé', to: 'done' },
  done: { label: 'Rouvrir', to: 'todo' }
};

function openCycle(c: Cycle | null) {
  target.value = { kind: 'cycle', path: c ? c.file : null, values: c ? { ...c } : { state: 'À venir' }, body: '' };
  dialog.value = true;
}
function openFeat(f: Feat | null) {
  target.value = { kind: 'feat', path: f ? f.file : null, values: f ? { ...f } : { cycle: data.value?.cycles[0]?.id ?? '' }, body: '' };
  dialog.value = true;
}
function openPulse(p: Pulse | null, feat: string) {
  target.value = { kind: 'pulse', path: p ? p.file : null, values: p ? { ...p } : { feat, state: 'todo', workflow: 'feat' }, body: p ? p.note : '' };
  dialog.value = true;
}
function askDelete(kind: EntityKind, file: string, title: string) { removing.value = { kind, file, title }; confirm.value = true; }
async function doDelete() { if (removing.value) await deleteEntity(removing.value.kind, removing.value.file); }
async function quick(p: Pulse) {
  failed.value = '';
  try { await saveEntity('pulse', p.file, { state: QUICK[p.state]?.to }); }
  catch (e) { failed.value = e instanceof Error ? e.message : String(e); }
}

const labels = {
  todo: 'À faire', plan: 'Plan à valider', run: 'En cours', wait: 'Attend ta validation', done: 'Terminé'
} as const;

const groups = computed(() => {
  const d = data.value;
  if (!d) return [];
  const withPulses = d.feats.map((f) => {
    const pulses = d.pulses.filter((p) => p.feat === f.id);
    const done = pulses.filter((p) => p.state === 'done').length;
    const spec = d.docs.find((doc) => doc.path === f.spec);
    return {
      ...f, pulses, done, pct: pulses.length ? Math.round((done / pulses.length) * 100) : 0,
      specTitle: spec?.title ?? ''
    };
  });
  const cycles = d.cycles.map((c) => ({ ...c, feats: withPulses.filter((f) => f.cycle === c.id) }));
  const orphans = withPulses.filter((f) => !d.cycles.some((c) => c.id === f.cycle));
  if (orphans.length) {
    cycles.push({ id: '-', parent: '', docs: [], title: 'Sans cycle', period: '', state: '', file: '', feats: orphans });
  }
  return cycles;
});
</script>

<style scoped lang="scss">
:where(button:not(.btn, .chipb)) { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; text-align: left; padding: 0; }
.page { height: calc(100vh - 56px); }
.empty { max-width: 520px; margin: 80px auto; display: flex; flex-direction: column; gap: 12px; align-items: flex-start; p { color: var(--muted-2); margin: 0; } }
.wrapper { height: 100%; display: flex; flex-direction: column; overflow: hidden; }
.topbar { flex: none; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 8px 24px; border-bottom: 1px solid var(--line); }
.pname { font-weight: 600; font-size: 16px; margin-right: 8px; }
.tabs { display: flex; gap: 4px; }
.tab { height: 40px; padding: 0 14px; display: flex; align-items: center; gap: 8px; border-radius: 8px; font-size: 14px; color: var(--muted-2); &:hover { color: var(--text); } &.sel { background: #2e2e34; color: var(--text); } .n { font-size: 12px; color: var(--muted); } }
.grow { flex: 1; }
.scroll { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 20px 24px 32px; }
.content { max-width: 1000px; display: flex; flex-direction: column; gap: 24px; &.narrow { max-width: 880px; gap: 12px; } }
.intro { font-size: 13px; color: var(--muted-2); margin: 0; display: flex; flex-wrap: wrap; gap: 6px 18px; b { color: var(--text); font-weight: 600; } }
.emptycard { color: var(--muted-2); text-align: center; padding: 28px; }
.cycle { display: flex; flex-direction: column; gap: 12px; }
.cycle-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; .file { margin-left: auto; } }
.title { font-weight: 600; font-size: 16px; }
.file { font-size: 11px; color: var(--muted); }
.feat { gap: 12px; padding: 16px; }
.feat-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; .title { font-size: 15px; } .count { margin-left: auto; font-size: 12px; color: var(--muted); } .push { margin-left: auto; } }
.id { font-size: 12px; color: var(--muted-2); }
.bar { height: 6px; background: var(--line); border-radius: 6px; overflow: hidden; }
.fill { height: 6px; background: var(--ok); }
.goal { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 13px; color: var(--muted-2); .tag { margin-left: auto; text-decoration: none; } }
.pulses { display: flex; flex-direction: column; gap: 2px; }
.pulse { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; min-height: 48px; padding: 4px 8px 4px 12px; border-radius: 8px; background: #1b1b1f; }
.pt { flex: 1 1 200px; font-weight: 500; }
.state { font-size: 12px; color: var(--muted-2); min-width: 130px; }
.addpulse { min-height: 40px; padding: 0 12px; border-radius: 8px; font-size: 13px; color: var(--muted-2); border: 1px dashed var(--line-2); margin-top: 6px; &:hover { color: var(--text); border-color: var(--muted); } }
.tabgroup { display: flex; flex-direction: column; gap: 2px; padding-right: 12px; margin-right: 4px; border-right: 1px solid var(--line); &:last-of-type { border-right: 0; } }
.glabel { font-size: 11px; color: var(--muted); padding-left: 14px; text-transform: uppercase; letter-spacing: .04em; }
.links { display: flex; flex-wrap: wrap; gap: 6px; }
.dlgcard { width: 560px; max-width: 92vw; background: #1b1b1f; }
.dlghead { font-weight: 600; font-size: 16px; }
.dlgbody { display: flex; flex-direction: column; gap: 12px; }
.splitrow { display: flex; align-items: center; gap: 8px; .search { flex: 1 1 auto; } }
.recap, .note { gap: 8px; }
.filters { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.search, .projsel { height: 40px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--line-2); background: #1b1b1f; color: var(--text); font: inherit; font-size: 14px; }
.search { flex: 1 1 220px; }
.chipb { height: 40px; padding: 0 12px; border-radius: 8px; font-size: 13px; color: var(--muted-2); display: flex; align-items: center; gap: 6px; border: 1px solid var(--line-2); &.sel { background: #2e2e34; color: var(--text); } .n { color: var(--muted); font-size: 12px; } }
.content.wide { max-width: 1400px; }
.tkwrap { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; &:has(.tkdetail) { grid-template-columns: minmax(0, 1fr) 460px; } }
.tklist { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.tkdetail { position: sticky; top: 0; gap: 12px; padding: 16px; max-height: calc(100vh - 190px); overflow: auto; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.kids { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.actions { display: flex; align-items: center; gap: 8px; }
button.tk { width: 100%; text-align: left; cursor: pointer; &.on { border-color: var(--muted); background: #25252a; } }
.tk { flex-direction: row; flex-wrap: wrap; align-items: center; gap: 6px 12px; padding: 10px 14px; }
.tt { flex: 1 1 260px; font-weight: 500; }
.rt { font-size: 14px; color: #d6d3cc; }
.meta { font-size: 12px; color: var(--muted); }
.open { align-self: flex-start; text-decoration: none; }
</style>
