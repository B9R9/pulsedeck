<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { pendingPrompt, pendingWorkflow } from '../composables/useTickets';
import { useProject } from '../composables/useProject';
import type { InboxItem, InboxKind } from '../shared/types';
import EntityDialog from '../components/EntityDialog.vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';

const { data, resolveInbox, deleteEntity, importDriveDoc } = useProject();
const driveDlg = ref(false);
const DRIVE_FIELDS = [{ key: 'url', label: 'Lien du Google Doc', type: 'string' as const, required: true, hint: 'Le document doit être partagé avec « toute personne disposant du lien ». Le premier paragraphe devient le titre.' }];
async function importDrive(f: Record<string, unknown>) { await importDriveDoc(String(f.url ?? '')); }

const DECIDABLE: InboxKind[] = ['valid', 'plan', 'bg', 'memo', 'doc'];
const editing = ref<InboxItem | null>(null);
const dialog = ref(false);
const removing = ref<InboxItem | null>(null);
const confirm = ref(false);
function openNew() { editing.value = null; dialog.value = true; }
function openEdit(i: InboxItem) { editing.value = i; dialog.value = true; }
function askDelete(i: InboxItem) { removing.value = i; confirm.value = true; }
async function doDelete() { if (removing.value) await deleteEntity('inbox', removing.value.path); }

const KINDS: Record<InboxKind, { label: string; cls: string; border: string }> = {
  alert: { label: 'Alerte', cls: 'fail', border: '#7a3a3a' },
  valid: { label: 'Validation', cls: 'hint', border: '#6b5316' },
  plan: { label: 'Plan', cls: 'blue', border: '#2f4a73' },
  memo: { label: 'Mémoire', cls: 'ok', border: '#2b2b31' },
  doc: { label: 'Documentation', cls: 'ok', border: '#2b2b31' },
  bg: { label: 'Tâche de fond', cls: 'blue', border: '#2f4a73' }
};

const GROUPS: { id: string; label: string; match: (i: InboxItem) => boolean }[] = [
  { id: 'all', label: 'Tout', match: () => true },
  { id: 'alert', label: 'Alertes', match: (i) => i.kind === 'alert' },
  { id: 'valid', label: 'Validations', match: (i) => i.kind === 'valid' },
  { id: 'plan', label: 'Plans', match: (i) => i.kind === 'plan' },
  { id: 'bg', label: 'Tâches de fond', match: (i) => i.kind === 'bg' },
  { id: 'mem', label: 'Mémoire', match: (i) => i.kind === 'memo' || i.kind === 'doc' },
  { id: 'done', label: 'Traités', match: () => false }
];

const filter = ref('all');
const failed = ref('');

const open = computed(() => (data.value?.inbox ?? []).filter((i) => !i.done));
const closed = computed(() => (data.value?.inbox ?? []).filter((i) => i.done));
const current = computed(() => GROUPS.find((g) => g.id === filter.value) ?? GROUPS[0]);
const items = computed(() => (filter.value === 'done' ? closed.value : open.value.filter(current.value.match)));
const count = (g: { id: string; match: (i: InboxItem) => boolean }) => (g.id === 'done' ? closed.value.length : open.value.filter(g.match).length);

const router = useRouter();
/** Prépare un brouillon avec le workflow proposé. Rien ne part : tu relis puis tu envoies. */
async function prepare(item: InboxItem) {
  pendingPrompt.value = item.prompt || item.title;
  pendingWorkflow.value = item.workflow;
  await done(item);
  await router.push({ name: 'developpement' });
}
async function done(item: InboxItem, result: '' | 'approved' | 'rejected' = '') {
  failed.value = '';
  try {
    await resolveInbox(item.path, result);
  } catch {
    failed.value = "Impossible d'enregistrer : le fichier n'a pas pu être modifié.";
  }
}
</script>

<template>
  <div class="inbox">
    <aside class="filters" aria-label="Filtres">
      <span class="h">Filtrer</span>
      <button
        v-for="g in GROUPS" :key="g.id" class="frow" :class="{ sel: filter === g.id }"
        :aria-pressed="filter === g.id" @click="filter = g.id"
      >
        <span class="grow">{{ g.label }}</span>
        <span class="mono n">{{ count(g) }}</span>
      </button>
    </aside>

    <main class="list">
      <div class="stack">
        <div class="bar"><button class="btn" @click="driveDlg = true">Importer un Google Doc</button><button class="btn main" @click="openNew">Nouvelle demande</button></div>
        <p v-if="failed" class="err" role="alert">{{ failed }}</p>
        <div v-if="!items.length" class="empty">{{ filter === 'done' ? 'Rien de traité pour le moment.' : "Rien n'attend ta décision ici." }}</div>
        <article v-for="i in items" :key="i.id" class="item" :style="{ borderColor: KINDS[i.kind].border }">
          <div class="top">
            <span class="tag" :class="KINDS[i.kind].cls">{{ KINDS[i.kind].label }}</span>
            <span class="tag">{{ i.project }}</span>
            <span class="title">{{ i.title }}</span>
            <span class="when">{{ i.when }}</span>
          </div>
          <span class="detail">{{ i.detail }}</span>
          <div v-if="i.done" class="banner" :class="i.result === 'approved' ? 'ok' : i.result === 'rejected' ? 'fail' : ''">
            {{ i.result === 'approved' ? 'Validé' : i.result === 'rejected' ? 'Refusé' : 'Traité' }}
          </div>
          <div class="acts">
            <template v-if="!i.done">
              <template v-if="DECIDABLE.includes(i.kind)">
                <button class="btn ok big" @click="done(i, 'approved')">Valider</button>
                <button class="btn danger big" @click="done(i, 'rejected')">Refuser</button>
                <router-link v-if="i.target" class="btn big" :to="{ name: i.target }">{{ i.kind === 'bg' ? 'Voir le détail' : i.primary || 'Voir le détail' }}</router-link>
              </template>
              <template v-else>
                <button v-if="i.workflow" class="btn main big" @click="prepare(i)">{{ i.primary }}</button>
                <router-link v-else-if="i.target" class="btn main big" :to="{ name: i.target }">{{ i.primary }}</router-link>
                <button class="btn big" @click="done(i)">{{ i.secondary || 'Marquer comme vu' }}</button>
              </template>
            </template>
            <span class="icons push">
              <button class="ic" :aria-label="'Modifier ' + i.title" title="Modifier" @click="openEdit(i)"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.5 2.5l3 3L6 13H3v-3z M9 4l3 3" /></svg></button>
              <button class="ic del" :aria-label="'Supprimer ' + i.title" title="Supprimer" @click="askDelete(i)"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9h6.6L12 4M6.5 7v3.5M9.5 7v3.5" /></svg></button>
            </span>
          </div>
        </article>
      </div>
    </main>

    <EntityDialog v-model="dialog" kind="inbox" :path="editing ? editing.path : null" :values="editing ? { ...editing } : { kind: 'valid', when: 'À l\'instant' }" />
    <EntityDialog v-model="driveDlg" :field-defs="DRIVE_FIELDS" :submit-fn="importDrive" title-text="Importer un ticket depuis Google Drive" :path="null" />
    <ConfirmDialog v-model="confirm" title="Supprimer cette demande ?" :message="removing?.title ?? ''" :on-confirm="doDelete" />
  </div>
</template>

<style scoped lang="scss">
.inbox { display: flex; height: calc(100vh - 56px); min-height: 0; overflow: hidden; }
.filters { flex: 0 0 220px; box-sizing: border-box; background: var(--panel); border-right: 1px solid var(--line); padding: 16px 12px; display: flex; flex-direction: column; gap: 2px; }
.filters .h { padding: 0 8px 6px; }
.frow {
  display: flex; align-items: center; min-height: 44px; padding: 0 10px; border-radius: 8px; font-size: 13px;
  background: none; border: 0; color: inherit; cursor: pointer; text-align: left; font-family: inherit;
  &:hover { background: #1f1f23; }
  &.sel { background: #232327; box-shadow: inset 0 0 0 1px var(--line-2); }
}
.grow { flex: 1; }
.n { font-size: 12px; color: var(--muted); }
.list { flex: 1 1 0; min-width: 0; overflow: auto; padding: 20px 28px; }
.stack { max-width: 880px; display: flex; flex-direction: column; gap: 12px; }
.empty { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 28px; text-align: center; color: var(--muted-2); }
.err { margin: 0; padding: 10px 14px; border-radius: 10px; background: #251516; border: 1px solid #7a3a3a; color: var(--fail); font-size: 13px; }
.item { background: var(--panel); border: 1px solid; border-radius: 12px; padding: 16px 18px; display: flex; flex-direction: column; gap: 10px; }
.top { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; }
.title { font-weight: 600; font-size: 15px; flex: 1 1 240px; }
.when { font-size: 12px; color: var(--muted); }
.detail { font-size: 13px; color: #c9c6bf; }
.acts { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; .push { margin-left: auto; } }
.bar { display: flex; justify-content: flex-end; gap: 8px; }
.big { height: 44px; text-decoration: none; }
</style>
