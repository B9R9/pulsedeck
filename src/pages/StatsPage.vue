<script setup lang="ts">
import { computed, ref } from 'vue';
import CostTree from '../components/CostTree.vue';
import { useProject } from '../composables/useProject';

const { data, rebuildStats } = useProject();
const rebuilding = ref(false);
async function rebuild() { rebuilding.value = true; try { await rebuildStats(); } finally { rebuilding.value = false; } }
const stats = computed(() => data.value?.stats ?? null);

const kTokens = (cost: string): number => {
  const m = /^(\d+(?:[.,]\d+)?)k$/.exec(cost.trim());
  return m ? Number(m[1].replace(',', '.')) : 0;
};

const agentBars = computed(() => {
  const rows = (stats.value?.session.nodes ?? []).map((n) => ({ label: n.label, k: kTokens(n.cost) })).filter((r) => r.k > 0);
  const total = rows.reduce((a, r) => a + r.k, 0) || 1;
  return rows.sort((a, b) => b.k - a.k).map((r, i) => ({
    label: r.label, tokens: r.k + 'k', pct: Math.round((r.k / total) * 100), color: i === 0 ? '#e8845c' : i === 1 ? '#b98b3c' : '#6b8cae'
  }));
});

const savedMax = computed(() => Math.max(1, ...(stats.value?.saved ?? []).map((r) => r.k)));
const savedTotal = computed(() => (stats.value?.saved ?? []).reduce((a, r) => a + r.k, 0));

const bricks = computed(() => {
  const total = stats.value?.brickTotal || 1;
  return (stats.value?.bricks ?? []).map((b) => ({
    ...b, pct: Math.round((b.count / total) * 100),
    color: b.count === 0 ? '#3f3f47' : b.count >= 5 ? 'rgba(134,239,172,.6)' : 'rgba(125,180,255,.6)',
    state: b.count === 0 ? 'Jamais choisi' : b.count >= 7 ? 'À attacher' : b.count <= 1 ? 'Rarement' : 'Utile',
    cls: b.count === 0 ? 'hint' : b.count >= 7 ? 'blue' : ''
  }));
});

const featCosts = computed(() => (data.value?.feats ?? []).map((f) => {
  const spent = stats.value?.featSpent[f.id] ?? 0;
  const budget = f.budget;
  const r = budget ? spent / budget : 0;
  return {
    id: f.id, title: f.title, spent: spent + 'k', budget: budget ? budget + 'k' : 'sans budget',
    pct: Math.min(100, Math.round(r * 100)),
    color: r > 1 ? '#e8845c' : r > 0.8 ? '#b98b3c' : '#6b8cae',
    state: !budget ? 'Sans budget' : r > 1 ? 'Dépassé' : spent === 0 ? 'Pas commencé' : r > 0.8 ? 'Proche' : 'Dans le budget',
    cls: !budget ? '' : r > 1 ? 'fail' : r > 0.8 ? 'hint' : ''
  };
}));
const cycleTotal = computed(() => Object.values(stats.value?.featSpent ?? {}).reduce((a, v) => a + v, 0));

const weekMax = computed(() => Math.max(1, ...(stats.value?.weeks ?? []).map((w) => w.value)));
const GANTT = { agent: '#6b8cae', script: 'rgba(125,180,255,.6)', human: '#fbbf24' };
const gantt = computed(() => {
  const max = stats.value?.ganttMax || 1;
  return (stats.value?.gantt ?? []).map((g) => ({
    label: g.label, color: GANTT[g.kind], left: +((g.start / max) * 100).toFixed(2), width: +(((g.end - g.start) / max) * 100).toFixed(2)
  }));
});
const ticks = computed(() => {
  const max = stats.value?.ganttMax || 1;
  return [0, 1, 2, 3, 4].map((i) => Math.round((max / 4) * i) + (i ? ' min' : ''));
});
const LEVEL = { 'Élevé': 'hi', 'Moyen': 'mid', 'Faible': 'lo' } as const;
const fmt = (n: number) => String(n).replace('.', ',');
</script>

<template>
  <div v-if="!stats" class="empty">Pas encore de statistiques : elles se calculent d'après les sessions de ce projet. Lance une session, puis reviens ici.</div>
  <main v-else class="stats">
    <div class="period">Période : {{ stats.period }} <button class="btn small" :disabled="rebuilding" @click="rebuild">{{ rebuilding ? 'Calcul en cours' : 'Recalculer' }}</button></div>

    <div class="kpis">
      <div v-for="k in stats.kpis" :key="k.label" class="card k">
        <span class="h">{{ k.label }}</span>
        <span class="v">{{ k.value }}</span>
        <span class="note">{{ k.note }}</span>
      </div>
    </div>

    <section class="card" aria-label="Workflow par coût">
      <div class="row">
        <strong>Dernière session {{ stats.session.name }}, colorée par coût</strong>
        <div class="legend">
          <span><i class="sw" style="background:#3a1f14;border-color:#e8845c" />Élevé</span>
          <span><i class="sw" style="background:#2a2316;border-color:#b98b3c" />Moyen</span>
          <span><i class="sw" style="background:#17171a;border-color:#4a4a53" />Faible</span>
          <span><i class="sw" style="border-style:dashed;border-color:#7db4ff" />Script, 0 token</span>
        </div>
      </div>
      <div class="treebox">
        <div class="scroll"><CostTree :nodes="stats.session.nodes" :edges="stats.session.edges" /></div>
        <div class="worst">
          <strong>{{ stats.session.worstTitle }}</strong>
          <span>{{ stats.session.worstText }}</span>
          <router-link class="btn" :to="{ name: 'architecture' }">Corriger dans Architecture</router-link>
        </div>
      </div>
    </section>

    <section v-if="stats.saved.length" class="card" aria-label="Économisé par les scripts">
      <div class="row">
        <span class="h">Économisé par les scripts</span>
        <span class="sub">Tokens qu'un agent aurait consommés pour les mêmes tâches de fond.</span>
        <span class="big">{{ savedTotal }}k tokens</span>
        <router-link class="tag blue" :to="{ name: 'architecture' }">Voir les tâches de fond</router-link>
      </div>
      <div v-for="r in stats.saved" :key="r.label" class="bar">
        <span class="bl">{{ r.label }}</span>
        <div class="trk"><div class="fill" :style="{ width: Math.round((r.k / savedMax) * 100) + '%', background: 'rgba(125,180,255,.6)' }" /></div>
        <span class="mono val">{{ r.k }}k</span>
      </div>
    </section>

    <section class="card" aria-label="Briques choisies">
      <div class="row">
        <span class="h">Skills et documents : disponibles contre choisis</span>
        <span class="sub">Ce que le planificateur a réellement utilisé sur les {{ stats.brickTotal }} dernières sessions.</span>
        <router-link class="tag blue" :to="{ name: 'architecture' }">Ajuster dans Architecture</router-link>
      </div>
      <div v-for="b in bricks" :key="b.label" class="bar">
        <span class="tag kind">{{ b.kind }}</span>
        <span class="bl">{{ b.label }}</span>
        <div class="trk"><div class="fill" :style="{ width: b.pct + '%', background: b.color }" /></div>
        <span class="mono val">{{ b.count }} / {{ stats.brickTotal }}</span>
        <span class="tag st" :class="b.cls">{{ b.state }}</span>
      </div>
      <div v-if="stats.brickAlert" class="alertbar">
        <span>{{ stats.brickAlert }}</span>
        <router-link class="btn" :to="{ name: 'architecture' }">Créer un skill</router-link>
      </div>
    </section>

    <section class="card" aria-label="Coût par Feat">
      <div class="row">
        <span class="h">Coût par Feat</span>
        <span class="sub">Cumul de tous les Pulses d'une Feat, comparé à son budget. Dépasser le budget crée une alerte.</span>
        <span class="muted">{{ stats.cycleLabel }} : {{ cycleTotal }}k sur {{ stats.cycleBudget }}k</span>
      </div>
      <div v-for="f in featCosts" :key="f.id" class="bar">
        <span class="mono fid">{{ f.id }}</span>
        <span class="bl">{{ f.title }}</span>
        <div class="trk tall"><div class="fill" :style="{ width: f.pct + '%', background: f.color }" /></div>
        <span class="mono val wide">{{ f.spent }} / {{ f.budget }}</span>
        <span class="tag st" :class="f.cls">{{ f.state }}</span>
      </div>
      <span v-if="stats.forecast" class="muted small">{{ stats.forecast }}</span>
    </section>

    <div class="grid">
      <section class="card" aria-label="Tokens par agent">
        <span class="h">Où partent les tokens</span>
        <div v-for="b in agentBars" :key="b.label" class="abar">
          <span class="al">{{ b.label }}</span>
          <div class="trk thin"><div class="fill" :style="{ width: b.pct + '%', background: b.color }" /></div>
          <span class="mono aval">{{ b.tokens }} · {{ b.pct }} %</span>
        </div>
        <span class="h top">Relances par session, 4 dernières semaines</span>
        <div class="weeks">
          <div v-for="w in stats.weeks" :key="w.label" class="wk">
            <span class="mono">{{ fmt(w.value) }}</span>
            <div class="stack" :style="{ height: Math.round((w.value / weekMax) * 48) + 'px' }" />
            <span class="wl">{{ w.label }}</span>
          </div>
        </div>
      </section>

      <section class="card" aria-label="Frise temporelle">
        <span class="h">Frise de la dernière session</span>
        <div v-for="g in gantt" :key="g.label" class="g">
          <span class="gl">{{ g.label }}</span>
          <div class="gt"><div class="gb" :style="{ left: g.left + '%', width: g.width + '%', background: g.color }" /></div>
        </div>
        <div class="g ticks"><span class="gl" /><div class="tk mono"><span v-for="t in ticks" :key="t">{{ t }}</span></div></div>
        <div class="legend">
          <span><i class="sw sq" style="background:#6b8cae" />Agent</span>
          <span><i class="sw sq" style="background:rgba(125,180,255,.6)" />Script</span>
          <span><i class="sw sq" style="background:#fbbf24" />Attente de toi</span>
        </div>
      </section>

      <section class="card" aria-label="Faiblesses">
        <span class="h">Faiblesses détectées</span>
        <div v-for="s in stats.issues" :key="s.title" class="issue">
          <div class="ih"><strong>{{ s.title }}</strong><span class="tag" :class="LEVEL[s.level]" style="margin-left:auto">{{ s.level }}</span></div>
          <span class="sub">{{ s.text }}</span>
          <router-link class="btn small-btn" :to="{ name: 'architecture' }">Corriger</router-link>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped lang="scss">
.empty { padding: 32px; color: var(--muted); }
.stats { height: calc(100vh - 56px); overflow: auto; padding: 20px 24px 24px; display: flex; flex-direction: column; gap: 18px; box-sizing: border-box; }
.period { font-size: 13px; color: var(--muted-2); display: flex; align-items: center; gap: 12px; }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr)); gap: 14px; }
.card { border-radius: 14px; padding: 18px; gap: 14px; }
.k { gap: 4px; padding: 14px 18px; }
.v { font-size: 28px; font-weight: 600; line-height: 1.2; }
.note, .sub { font-size: 13px; color: var(--muted-2); }
.row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; > .sub { flex: 1 1 300px; } }
.big { font-size: 22px; font-weight: 600; }
.muted { font-size: 13px; color: var(--muted); &.small { font-size: 12px; } }
.legend { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 12px; color: var(--muted-2); span { display: flex; align-items: center; gap: 6px; } }
.sw { width: 14px; height: 14px; border-radius: 4px; border: 1.5px solid transparent; display: inline-block; &.sq { width: 12px; height: 12px; border: 0; border-radius: 3px; } }
.treebox { display: flex; flex-wrap: wrap; gap: 20px 32px; align-items: flex-start; }
.scroll { overflow: auto; max-width: 100%; }
.worst { flex: 1 1 260px; min-width: 240px; display: flex; flex-direction: column; gap: 8px; background: var(--panel-2); border-radius: 12px; padding: 16px; font-size: 13px; color: #c9c6bf; strong { color: var(--text); font-size: 14px; } }
.btn { text-decoration: none; align-self: flex-start; }
.bar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; }
.bl { flex: 1 1 200px; font-size: 13px; }
.trk { flex: 2 1 260px; position: relative; height: 12px; background: var(--panel-2); border-radius: 4px; overflow: hidden; &.tall { height: 14px; flex-basis: 280px; } &.thin { flex: 1 1 0; height: 10px; border-radius: 5px; } }
.fill { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 4px; }
.val { font-size: 12px; min-width: 48px; text-align: right; &.wide { min-width: 110px; } }
.kind { min-width: 64px; text-align: center; }
.st { min-width: 96px; text-align: center; }
.fid { font-size: 12px; color: var(--muted-2); min-width: 40px; }
.alertbar { background: #221d12; border: 1px solid #6b5316; border-radius: 10px; padding: 10px 14px; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; font-size: 13px; color: var(--warn); span { flex: 1 1 320px; } .btn { height: 44px; color: var(--text); } }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(340px, 100%), 1fr)); gap: 14px; }
.abar { display: flex; align-items: center; gap: 10px; font-size: 13px; }
.al { flex: 0 0 96px; }
.aval { flex: 0 0 90px; text-align: right; font-size: 12px; color: #c9c6bf; }
.top { margin-top: 6px; }
.weeks { display: flex; align-items: flex-end; gap: 14px; height: 84px; }
.wk { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; justify-content: flex-end; height: 100%; .mono { font-size: 12px; color: #c9c6bf; } }
.stack { width: 100%; border-radius: 4px 4px 0 0; background: var(--clay); }
.wl { font-size: 11px; color: var(--muted); }
.g { display: flex; align-items: center; gap: 10px; font-size: 12px; }
.gl { flex: 0 0 92px; color: #c9c6bf; }
.gt { position: relative; flex: 1; height: 16px; background: var(--panel-2); border-radius: 4px; }
.gb { position: absolute; top: 0; height: 16px; border-radius: 4px; }
.ticks { font-size: 11px; color: var(--muted); }
.tk { flex: 1; display: flex; justify-content: space-between; }
.issue { display: flex; flex-direction: column; gap: 6px; padding-bottom: 12px; border-bottom: 1px solid var(--line); }
.ih { display: flex; align-items: center; gap: 10px; }
.small-btn { height: 36px; }
.tag.hi { color: #fdba9b; border-color: #7a3a22; }
.tag.mid { color: var(--warn); border-color: #6b5316; }
.tag.lo { color: var(--blue); border-color: #2f4a73; }
</style>
