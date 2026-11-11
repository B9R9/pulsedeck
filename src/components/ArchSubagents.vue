<script setup lang="ts">
import { computed, ref } from 'vue';
import { useProject } from '../composables/useProject';
import ConfirmDialog from './ConfirmDialog.vue';
import type { SubAgent } from '../shared/types';

const { data, syncSubagents, removeSubagent } = useProject();
const failed = ref('');
const busy = ref(false);
const confirm = ref(false);
const pending = ref<{ title: string; message: string; action: string; run: () => Promise<void> } | null>(null);
async function doConfirm() { if (pending.value) await pending.value.run(); }

const STATE = {
  missing: ['À créer', 'hint'],
  synced: ['À jour', 'ok'],
  outdated: ['Différent du workflow', 'hint'],
  conflict: ['Fichier à toi, non touché', 'fail'],
  orphan: ["L'étape n'existe plus", 'fail']
} as const;

const all = computed(() => data.value?.subagents ?? []);
const groups = computed(() => {
  const m = new Map<string, { name: string; items: SubAgent[] }>();
  for (const a of all.value) {
    if (!m.has(a.workflow)) m.set(a.workflow, { name: a.workflowName, items: [] });
    m.get(a.workflow)!.items.push(a);
  }
  return [...m.values()];
});
const todo = computed(() => all.value.filter((a) => a.state === 'missing' || a.state === 'outdated'));

async function run(fn: () => Promise<void>) {
  busy.value = true; failed.value = '';
  try { await fn(); } catch (e) {
    failed.value = (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']*': (Error: )?/, '');
  } finally { busy.value = false; }
}
function write(list: SubAgent[]) {
  const overwrite = list.filter((a) => a.state === 'outdated');
  const go = () => run(() => syncSubagents(list.map((a) => a.name)));
  if (!overwrite.length) { void go(); return; }
  pending.value = {
    title: 'Remplacer ces sous-agents ?', action: 'Remplacer',
    message: `${overwrite.map((a) => a.file).join(', ')} sera réécrit d'après le workflow. Si tu l'avais retouché à la main, ces retouches seront perdues.`,
    run: go
  };
  confirm.value = true;
}
function remove(a: SubAgent) {
  pending.value = { title: 'Retirer ce sous-agent ?', action: 'Retirer', message: a.file, run: () => run(() => removeSubagent(a.name)) };
  confirm.value = true;
}
</script>

<template>
  <div class="page">
    <div class="stack">
      <div class="head">
        <div class="intro">
          <strong>Sous-agents Claude Code</strong>
          <span class="sub">Chaque étape agent d'un workflow peut devenir un sous-agent dans <span class="mono">.claude/agents/</span>. Claude Code te le propose alors dans ses propres sessions, avec le même prompt, les mêmes outils et le même modèle.</span>
        </div>
        <button class="btn main" :disabled="busy || !todo.length" @click="write(todo)">Tout synchroniser ({{ todo.length }})</button>
      </div>
      <p v-if="failed" class="err" role="alert">{{ failed }}</p>

      <section v-for="g in groups" :key="g.name" class="card pad">
        <span class="h">{{ g.name }}</span>
        <div v-for="a in g.items" :key="a.name" class="row">
          <div class="who">
            <strong>{{ a.label }}</strong>
            <span class="small mono">{{ a.file }}</span>
          </div>
          <span class="small">{{ a.model }}<template v-if="a.tools.length"> · {{ a.tools.join(', ') }}</template></span>
          <span class="tag" :class="STATE[a.state][1]">{{ STATE[a.state][0] }}</span>
          <button v-if="a.state === 'missing'" class="btn" :disabled="busy" @click="write([a])">Créer</button>
          <button v-else-if="a.state === 'outdated'" class="btn" :disabled="busy" @click="write([a])">Mettre à jour</button>
          <button v-else-if="a.state === 'orphan'" class="btn danger" :disabled="busy" @click="remove(a)">Retirer</button>
        </div>
      </section>
      <div v-if="!all.length" class="card pad">Aucun workflow n'a d'étape agent.</div>
      <span class="small">Seuls les fichiers marqués par l'application sont modifiés ou retirés. Un sous-agent que tu as écrit toi-même n'est jamais touché.</span>
    </div>
    <ConfirmDialog v-model="confirm" :title="pending?.title ?? ''" :message="pending?.message ?? ''" :action="pending?.action ?? 'Confirmer'" :on-confirm="doConfirm" />
  </div>
</template>

<style scoped lang="scss">
.page { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 20px 24px 24px; }
.stack { max-width: 960px; display: flex; flex-direction: column; gap: 16px; }
.head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; }
.intro { display: flex; flex-direction: column; flex: 1 1 360px; strong { font-size: 16px; } }
.sub { font-size: 13px; color: var(--muted-2); }
.small { font-size: 12px; color: var(--muted); }
.pad { gap: 10px; padding: 16px; }
.row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; background: var(--panel-2); border-radius: 10px; padding: 10px 14px; }
.who { display: flex; flex-direction: column; flex: 1 1 240px; gap: 2px; strong { font-weight: 500; font-size: 13px; } }
.err { margin: 0; padding: 10px 14px; border-radius: 10px; background: #251516; border: 1px solid #7a3a3a; color: var(--fail); font-size: 13px; }
</style>
