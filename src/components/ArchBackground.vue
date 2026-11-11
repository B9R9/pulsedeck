<script setup lang="ts">
import { computed, ref } from 'vue';
import { useProject } from '../composables/useProject';
import EntityDialog from './EntityDialog.vue';
import ConfirmDialog from './ConfirmDialog.vue';
import type { BackgroundTask } from '../shared/types';

const { data, patchFile, deleteEntity, runBackgroundTask, approveBackgroundTask } = useProject();
const running = ref('');
const toApprove = ref<BackgroundTask | null>(null);
const askApprove = ref(false);
function ask(t: BackgroundTask) { toApprove.value = t; askApprove.value = true; }
async function doApprove() { if (toApprove.value) await approveBackgroundTask(toApprove.value.id); }
async function runNow(t: BackgroundTask) {
  running.value = t.id; failed.value = '';
  try { await runBackgroundTask(t.id); } catch (e) { failed.value = e instanceof Error ? e.message : 'Le lancement a échoué.'; } finally { running.value = ''; }
}
const RES = { ok: 'Dernier résultat : réussi', fail: 'Dernier résultat : échec', skipped: 'Dernier résultat : ignoré' } as const;
const dialog = ref(false);
const editing = ref<BackgroundTask | null>(null);
const confirm = ref(false);
const removing = ref<BackgroundTask | null>(null);
function openTask(t: BackgroundTask | null) { editing.value = t; dialog.value = true; }
function askDelete(t: BackgroundTask) { removing.value = t; confirm.value = true; }
async function doDelete() { if (removing.value) await deleteEntity('background', removing.value.path); }
const failed = ref('');

const tasks = computed(() => data.value?.background ?? []);
const settings = computed(() => data.value?.archSettings);
const workflows = computed(() => data.value?.workflows ?? []);
const saved = computed(() => tasks.value.filter((t) => t.active).reduce((a, t) => a + t.savedK, 0));
const candSaved = computed(() => (settings.value?.candidates ?? []).reduce((a, c) => a + c.savedK, 0));
const CAPS = [20, 50, 100];
const TYPE = { script: ['Script', 'blue'], agent: ['Agent', 'ok'], both: ['Script puis agent', 'hint'] } as const;

async function patch(path: string, p: Record<string, unknown>) {
  failed.value = '';
  try {
    await patchFile(path, p);
  } catch {
    failed.value = "Impossible d'enregistrer ce changement.";
  }
}
const launchOptions = computed(() => [{ id: '', name: 'Aucun' }, ...workflows.value.map((w) => ({ id: w.id, name: w.name }))]);
</script>

<template>
  <div class="page">
    <div class="stack">
      <div class="head">
        <div class="intro">
          <strong>Tâches de fond</strong>
          <span class="sub">Ce qui tourne sans que tu prompts. Un script fait le travail mécanique, l'agent n'est réveillé que si quelque chose est à rédiger.</span>
        </div>
        <button class="btn main" @click="openTask(null)">Nouvelle tâche</button>
        <div class="card tight"><span class="small">Économisé cette semaine</span><span class="big">{{ saved }}k tokens</span></div>
      </div>
      <p v-if="failed" class="err" role="alert">{{ failed }}</p>

      <section class="card pad">
        <span class="h">Garde-fous des lancements</span>
        <span class="txt">Une tâche de fond ne démarre jamais un workflow seule. Elle crée une demande dans « À traiter » et attend ton accord.</span>
        <div class="line">
          <span class="small">Plafond de tokens par jour pour ces lancements</span>
          <button
            v-for="c in CAPS" :key="c" class="seg" :class="{ sel: settings?.bgCap === c }" :aria-pressed="settings?.bgCap === c"
            @click="patch('settings.md', { bgCap: c })"
          >{{ c }}k</button>
        </div>
        <span class="small">Une tâche ne tourne seule qu'après ton approbation, valable pour la commande et la consigne exactes.</span>
      </section>

      <div class="list">
        <div v-for="t in tasks" :key="t.id" class="card task">
          <div class="who"><strong>{{ t.name }}</strong><span class="sub">{{ t.what }}</span></div>
          <span class="tag">{{ t.trigger }}</span>
          <span class="tag" :class="TYPE[t.type][1]">{{ TYPE[t.type][0] }}</span>
          <span class="mono cost">{{ t.cost }}</span>
          <span class="when">{{ t.last }}</span>
          <span v-if="!t.approved" class="tag hint">À approuver</span>
          <button v-if="!t.approved" class="btn" @click="ask(t)">Approuver</button>
          <button v-else class="btn" :disabled="running === t.id" @click="runNow(t)">{{ running === t.id ? 'En cours…' : 'Lancer maintenant' }}</button>
          <button class="switch" :class="{ on: t.active }" :aria-pressed="t.active" @click="patch(t.path, { active: !t.active })">{{ t.active ? 'Actif' : 'En pause' }}</button>
          <span class="icons">
            <button class="ic" :aria-label="'Modifier ' + t.name" title="Modifier" @click="openTask(t)"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.5 2.5l3 3L6 13H3v-3z M9 4l3 3" /></svg></button>
            <button class="ic del" :aria-label="'Supprimer ' + t.name" title="Supprimer" @click="askDelete(t)"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9h6.6L12 4M6.5 7v3.5M9.5 7v3.5" /></svg></button>
          </span>
          <div v-if="t.lastResult" class="out">
            <span class="small">{{ RES[t.lastResult] }}</span>
            <pre v-if="t.lastOutput" class="mono outtxt">{{ t.lastOutput }}</pre>
          </div>
          <div v-if="t.launchable" class="launch">
            <span class="h">Quand ça arrive, lancer</span>
            <button v-for="o in launchOptions" :key="o.id" class="seg small" :class="{ sel: t.launch === o.id }" :aria-pressed="t.launch === o.id" @click="patch(t.path, { launch: o.id })">{{ o.name }}</button>
            <span class="tag hint">{{ t.launch ? 'Confirmation avant lancement, dans À traiter' : 'Ne lance rien' }}</span>
          </div>
        </div>
        <div v-if="!tasks.length" class="card pad">Aucune tâche dans <span class="mono">background/</span>.</div>
      </div>

      <section v-if="settings?.candidates.length" class="card pad">
        <span class="h">Candidates pour devenir un script</span>
        <div v-for="c in settings.candidates" :key="c.id" class="cand"><span>{{ c.text }}</span><span class="tag">≈ {{ c.savedK }}k par semaine</span></div>
        <span class="small">Total possible : {{ candSaved }}k par semaine. La création du script n'est pas encore branchée.</span>
      </section>
    </div>
    <EntityDialog v-model="dialog" kind="background" :path="editing ? editing.path : null" :values="editing ? { ...editing } : { type: 'script', active: false }" />
    <ConfirmDialog
      v-model="askApprove" title="Autoriser cette tâche à tourner seule ?"
      :message="toApprove ? [toApprove.command ? 'Script : ' + toApprove.command : '', toApprove.prompt ? 'Agent : ' + toApprove.prompt : ''].filter(Boolean).join(' / ') + ' Si tu modifies la commande ou la consigne, il faudra approuver de nouveau.' : ''"
      :on-confirm="doApprove"
    />
    <ConfirmDialog v-model="confirm" title="Supprimer cette tâche de fond ?" :message="removing?.name ?? ''" :on-confirm="doDelete" />
  </div>
</template>

<style scoped lang="scss">
:where(button:not(.btn, .chipb)) { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; text-align: left; padding: 0; }
.page { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 20px 24px 24px; }
.stack { max-width: 960px; display: flex; flex-direction: column; gap: 16px; }
.head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; }
.intro { display: flex; flex-direction: column; flex: 1 1 360px; strong { font-size: 16px; } }
.sub { font-size: 13px; color: var(--muted-2); }
.small:not(.btn) { font-size: 12px; color: var(--muted); }
.txt { font-size: 13px; color: #d6d3cc; }
.big { font-size: 22px; font-weight: 600; }
.tight { gap: 0; padding: 10px 16px; }
.pad { gap: 10px; padding: 16px; }
.line { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.seg { height: 40px; padding: 0 12px; display: flex; align-items: center; font-size: 13px; color: var(--muted-2); border-radius: 8px; border: 1px solid #34343b; &:hover { color: var(--text); } &.sel { background: #2e2e34; color: var(--text); border-color: #4a4a53; } &.small { height: 36px; } }
.list { display: flex; flex-direction: column; gap: 8px; }
.task { flex-direction: row; flex-wrap: wrap; align-items: center; gap: 8px 14px; padding: 12px 16px; }
.who { display: flex; flex-direction: column; flex: 1 1 240px; gap: 2px; strong { font-weight: 500; } }
.cost { font-size: 12px; color: var(--muted-2); min-width: 90px; }
.when { font-size: 12px; color: var(--muted); min-width: 96px; }
.state { height: 44px; min-width: 76px; justify-content: center; }
.launch { flex: 1 1 100%; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; border-top: 1px solid var(--line); padding-top: 10px; }
.cand { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; background: var(--panel-2); border-radius: 10px; padding: 10px 14px; font-size: 13px; span:first-child { flex: 1 1 320px; } }
.out { flex: 1 1 100%; display: flex; flex-direction: column; gap: 4px; }
.outtxt { margin: 0; max-height: 120px; overflow: auto; white-space: pre-wrap; font-size: 12px; color: var(--muted-2); background: var(--panel-2); border-radius: 8px; padding: 8px 10px; }
.err { margin: 0; padding: 10px 14px; border-radius: 10px; background: #251516; border: 1px solid #7a3a3a; color: var(--fail); font-size: 13px; }
</style>
