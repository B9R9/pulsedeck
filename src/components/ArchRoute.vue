<script setup lang="ts">
import { computed, ref } from 'vue';
import { useProject } from '../composables/useProject';

defineEmits<{ (e: 'open', id: string): void }>();
const { data, patchFile } = useProject();
const failed = ref('');
const sample = ref(0);

const settings = computed(() => data.value?.archSettings);
const workflows = computed(() => data.value?.workflows ?? []);
const CONFIRM = [['always', 'Toujours'], ['under', 'Sous 80 % de confiance'], ['never', 'Jamais']] as const;
const NOMATCH = [['plan', 'Plan libre'], ['free', 'Agent libre'], ['ask', 'Me demander']] as const;
const LOCAL = ['qwen2.5-coder:14b', 'llama3.1:8b', 'mistral:7b'];

const current = computed(() => settings.value?.samples[sample.value] ?? null);
const color = (c: number) => (c >= 90 ? '#4ade80' : c >= 75 ? '#fbbf24' : '#fca5a5');
const planRows = computed(() => (current.value?.picks ?? []).map(([purpose, libId]) => {
  const node = data.value?.library.find((l) => l.path === `library/${libId}.md`);
  const models = node ? [node.model, ...node.fallback] : [];
  return { purpose, node: node?.label ?? libId, models: models.join(', puis '), local: models.some((m) => LOCAL.includes(m)) };
}));
const freeAsk = computed(() => ({
  plan: 'Aucun squelette ne convient : le planificateur assemble un plan à partir de la bibliothèque et te le montre avant de lancer.',
  free: 'Aucun squelette ne convient : un agent libre prend la main, sans plan.',
  ask: 'Aucun squelette ne convient : le routeur te demande comment procéder.'
}[settings.value?.noMatch ?? 'plan']));

async function set(key: 'confirm' | 'noMatch', value: string) {
  failed.value = '';
  try {
    await patchFile('settings.md', { [key]: value });
  } catch {
    failed.value = "Impossible d'enregistrer ce changement.";
  }
}
</script>

<template>
  <div class="page">
    <div class="stack">
      <p v-if="failed" class="err" role="alert">{{ failed }}</p>
      <section class="sec">
        <span class="h">Routeur</span>
        <div class="card pad">
          <div class="line"><span>Chaque prompt est lu par</span><span class="tag blue">{{ settings?.router }}</span><span>qui choisit un workflow et donne sa confiance.</span></div>
          <span class="small">Demander ta confirmation avant de lancer</span>
          <div class="chips" role="group" aria-label="Confirmation">
            <button v-for="[id, label] in CONFIRM" :key="id" class="seg" :class="{ sel: settings?.confirm === id }" :aria-pressed="settings?.confirm === id" @click="set('confirm', id)">{{ label }}</button>
          </div>
        </div>
      </section>

      <section class="sec">
        <span class="h">Règles de déclenchement</span>
        <div v-for="w in workflows" :key="w.id" class="card rule">
          <div class="who"><strong>{{ w.name }}</strong><span class="sub">{{ w.when }}</span></div>
          <button class="btn" @click="$emit('open', w.id)">Ouvrir le workflow</button>
        </div>
      </section>

      <section class="sec">
        <span class="h">Quand aucun squelette ne convient</span>
        <div class="card pad">
          <span class="txt">Un squelette fixe garde les coûts et les alertes lisibles. Ses emplacements adaptatifs sont remplis par le planificateur. Si rien ne correspond, il peut assembler un plan à partir de la bibliothèque.</span>
          <div class="chips" role="group" aria-label="Sans squelette">
            <button v-for="[id, label] in NOMATCH" :key="id" class="seg" :class="{ sel: settings?.noMatch === id }" :aria-pressed="settings?.noMatch === id" @click="set('noMatch', id)">{{ label }}</button>
          </div>
          <span class="small">Dans tous les cas, tu vois le plan et le choix des skills avant le lancement.</span>
        </div>
      </section>

      <section v-if="settings?.samples.length" class="sec">
        <span class="h">Tester le routage avec un prompt</span>
        <div class="samples">
          <button v-for="(s, i) in settings.samples" :key="s.text" class="sample" :class="{ sel: i === sample }" :aria-pressed="i === sample" @click="sample = i">{{ s.text }}</button>
        </div>
        <div v-if="current" class="result">
          <div class="line"><span class="sub">Workflow proposé</span><span class="tag ok">{{ current.wf }}</span><span class="mono">confiance {{ current.conf }} %</span></div>
          <div class="meter"><div :style="{ width: current.conf + '%', background: color(current.conf) }" /></div>
          <span class="txt">{{ current.conf >= 75 ? 'Le routeur propose ce squelette.' : freeAsk }}</span>
        </div>
        <span class="h">Plan assemblé à partir de la bibliothèque</span>
        <div v-for="(r, i) in planRows" :key="i" class="card plan">
          <span class="tag hint purpose">{{ r.purpose }}</span>
          <span class="pn">{{ r.node }}</span>
          <span class="sub2">{{ r.models }}</span>
          <span v-if="r.local" class="tag blue">Local</span>
        </div>
        <span class="small">Résultats d'exemple : le vrai routeur sera branché avec Claude Code.</span>
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
:where(button:not(.btn, .chipb)) { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; text-align: left; padding: 0; }
.page { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 20px 24px 24px; }
.stack { max-width: 900px; display: flex; flex-direction: column; gap: 24px; }
.sec { display: flex; flex-direction: column; gap: 10px; }
.pad { gap: 12px; padding: 16px; }
.line { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; }
.small:not(.btn) { font-size: 12px; color: var(--muted); }
.sub { font-size: 13px; color: var(--muted-2); }
.sub2 { font-size: 13px; color: #c9c6bf; }
.txt { font-size: 13px; color: #d6d3cc; }
.seg { height: 40px; padding: 0 12px; display: flex; align-items: center; font-size: 13px; color: var(--muted-2); border-radius: 8px; border: 1px solid #34343b; &:hover { color: var(--text); } &.sel { background: #2e2e34; color: var(--text); border-color: #4a4a53; } }
.rule { flex-direction: row; flex-wrap: wrap; align-items: center; gap: 8px 16px; padding: 12px 16px; }
.who { display: flex; flex-direction: column; flex: 1 1 300px; strong { font-weight: 500; } }
.samples { display: flex; flex-direction: column; gap: 6px; }
.sample { padding: 10px 14px; border-radius: 10px; border: 1px solid var(--line); font-size: 13px; min-height: 44px; display: flex; align-items: center; &:hover { background: #1f1f23; } &.sel { background: #232327; box-shadow: inset 0 0 0 1px var(--line-2); } }
.result { background: var(--panel-2); border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
.meter { height: 6px; background: var(--line); border-radius: 6px; overflow: hidden; div { height: 6px; } }
.plan { flex-direction: row; flex-wrap: wrap; align-items: center; gap: 6px 12px; padding: 10px 14px; }
.purpose { min-width: 76px; text-align: center; }
.pn { flex: 1 1 160px; font-weight: 500; }
.err { margin: 0; padding: 10px 14px; border-radius: 10px; background: #251516; border: 1px solid #7a3a3a; color: var(--fail); font-size: 13px; }
</style>
