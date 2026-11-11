<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useProject } from '../composables/useProject';
import ConfirmDialog from './ConfirmDialog.vue';

const props = defineProps<{ workflowId: string; workflowName: string }>();
const { data, restoreWorkflowVersion, snapshotWorkflow } = useProject();
const idx = ref(0);
const failed = ref('');
const busy = ref(false);
const askRestore = ref(false);

async function run(fn: () => Promise<void>) {
  busy.value = true;
  failed.value = '';
  try { await fn(); idx.value = 0; } catch (e) {
    failed.value = (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']*': (Error: )?/, '');
  } finally { busy.value = false; }
}
const snapshot = () => run(() => snapshotWorkflow(props.workflowId));
const restore = async () => { const v = cur.value; if (v) await restoreWorkflowVersion(props.workflowId, v.name); };

const versions = computed(() => data.value?.versions[props.workflowId] ?? []);
const cur = computed(() => versions.value[idx.value] ?? null);
watch(() => props.workflowId, () => { idx.value = 0; });
</script>

<template>
  <div v-if="!versions.length" class="page">
    <div class="card pad empty-msg">
      Aucune version enregistrée pour {{ workflowName }}. Une version est prise automatiquement au premier lancement, puis à chaque lancement dont le workflow a changé.
      <div class="vact"><button class="btn small" :disabled="busy || !workflowId" @click="snapshot">Enregistrer la version actuelle</button></div>
      <p v-if="failed" class="verr" role="alert">{{ failed }}</p>
    </div>
  </div>
  <div v-else class="vwrap">
    <section class="list" aria-label="Versions">
      <span class="h">Versions de {{ workflowName }}</span>
      <button v-for="(v, i) in versions" :key="v.name" class="vrow" :class="{ sel: i === idx }" :aria-pressed="i === idx" @click="idx = i">
        <div class="line"><strong>{{ v.name }}</strong><span class="tag" :class="v.tag === 'Actuelle' ? 'ok' : v.tag === 'Suggestion appliquée' ? 'blue' : ''">{{ v.tag || 'Ancienne' }}</span></div>
        <span class="chg">{{ v.change }}</span>
        <span class="small">{{ v.meta }}</span>
      </button>
    </section>
    <section v-if="cur" class="detail" aria-label="Détail">
      <span class="title">{{ cur.name }}</span>
      <div class="stats">
        <div v-for="k in cur.stats" :key="k.label" class="card k"><span class="small">{{ k.label }}</span><span class="v">{{ k.value }}</span><span class="sm2">{{ k.hint }}</span></div>
      </div>
      <p v-if="!cur.stats.length" class="note">Aucune session n'a encore utilisé cette version, les chiffres apparaîtront après un lancement.</p>
      <div class="vact">
        <button v-if="cur.restorable && cur.tag !== 'Actuelle'" class="btn" :disabled="busy" @click="askRestore = true">Revenir à cette version</button>
        <button class="btn" :disabled="busy" @click="snapshot">Enregistrer l'état actuel</button>
      </div>
      <p class="note">Revenir à une version remet le workflow dans cet état et l'enregistre comme une nouvelle version : rien n'est perdu.</p>
      <p v-if="failed" class="verr" role="alert">{{ failed }}</p>
      <ConfirmDialog v-model="askRestore" :title="'Revenir à ' + cur.name + ' ?'" :message="'Le workflow ' + workflowName + ' reprendra l\'état de ' + cur.name + '. Les modifications faites depuis sont gardées dans l\'historique.'" action="Revenir" :on-confirm="restore" />
    </section>
  </div>
</template>

<style scoped lang="scss">
:where(button:not(.btn, .chipb)) { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; text-align: left; padding: 0; }
.page { padding: 20px 24px; }
.pad { padding: 16px; }
.vwrap { flex: 1 1 auto; min-height: 0; display: flex; overflow: hidden; }
.list { flex: 0 0 360px; box-sizing: border-box; border-right: 1px solid var(--line); padding: 16px 12px; display: flex; flex-direction: column; gap: 4px; overflow: auto; .h { padding: 0 8px 6px; } }
.vrow { display: flex; flex-direction: column; gap: 4px; padding: 12px; border-radius: 10px; &:hover { background: #1f1f23; } &.sel { background: #232327; box-shadow: inset 0 0 0 1px var(--line-2); } }
.line { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.chg { font-size: 13px; color: #c9c6bf; }
.small:not(.btn) { font-size: 12px; color: var(--muted); }
.sm2 { font-size: 12px; color: var(--muted-2); }
.detail { flex: 1 1 0; min-width: 0; overflow: auto; padding: 20px 24px; display: flex; flex-direction: column; gap: 18px; }
.title { font-size: 18px; font-weight: 600; }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(160px, 100%), 1fr)); gap: 12px; max-width: 760px; }
.k { gap: 2px; }
.v { font-size: 22px; font-weight: 600; }
.note { margin: 0; font-size: 12px; color: var(--muted); max-width: 760px; }
.vact { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
.verr { margin: 8px 0 0; font-size: 12px; color: var(--fail); }
.empty-msg { display: block; color: var(--muted-2); font-size: 13px; }
</style>
