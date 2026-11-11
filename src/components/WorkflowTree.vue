<script setup lang="ts">
import { computed } from 'vue';
import type { NodeState, Session } from '../shared/types';

const props = defineProps<{ session: Session }>();

const W = 140;
const H = 72;
const CX = 165;
const LS = 92;

const STROKE: Record<NodeState, string> = {
  done: '#A8A59E', run: '#4ADE80', wait: '#FBBF24', plan: '#6B6B75', alert: '#FCA5A5'
};
const KINDS = {
  fail: { stroke: '#FCA5A5', dash: '6 4' },
  blocked: { stroke: '#FCD34D', dash: '2 4' }
};

const nodes = computed(() => props.session.nodes.map((n) => ({ ...n, left: n.c * CX, top: n.l * LS })));

const links = computed(() => {
  const byId = new Map(nodes.value.map((n) => [n.id, n]));
  return props.session.edges.flatMap(([a, b, kind]) => {
    const A = byId.get(a);
    const B = byId.get(b);
    if (!A || !B) return [];
    const x1 = A.left + W;
    const y1 = A.top + H / 2;
    const x2 = B.left;
    const y2 = B.top + H / 2;
    const top = Math.min(y1, y2) - 6;
    const w = x2 - x1;
    const h = Math.abs(y2 - y1) + 12;
    const sy = y1 - top;
    const ey = y2 - top;
    const d = `M 0 ${sy} C ${w / 2} ${sy}, ${w / 2} ${ey}, ${w - 4} ${ey} M ${w - 11} ${ey - 5} L ${w - 3} ${ey} L ${w - 11} ${ey + 5}`;
    const special = kind ? KINDS[kind] : null;
    return [{
      key: `${a}-${b}-${kind ?? ''}`, left: x1, top, w, h, d,
      stroke: special ? special.stroke : STROKE[B.state],
      dash: special ? special.dash : B.state === 'plan' ? '5 5' : 'none',
      flow: !special && B.state === 'run'
    }];
  });
});

const width = computed(() => Math.max(...nodes.value.map((n) => n.left + W), 0) + 8);
const height = computed(() => Math.max(...nodes.value.map((n) => n.top + H), 0) + 8);
</script>

<template>
  <div class="tree" :style="{ width: width + 'px', height: height + 'px' }">
    <svg
      v-for="k in links" :key="k.key" :width="k.w" :height="k.h" aria-hidden="true"
      :style="{ position: 'absolute', left: k.left + 'px', top: k.top + 'px', overflow: 'visible' }"
    >
      <path :class="{ flow: k.flow }" :d="k.d" fill="none" :stroke="k.stroke" stroke-width="2" :stroke-dasharray="k.dash" />
    </svg>
    <div v-for="n in nodes" :key="n.id" class="node" :class="n.state" :style="{ left: n.left + 'px', top: n.top + 'px' }">
      <span class="top"><span class="dot" :class="n.state" aria-hidden="true" /><span class="label">{{ n.label }}</span></span>
      <span class="sub mono">{{ n.sub }}</span>
      <span class="meta">{{ n.meta }}</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.tree { position: relative; }
.node {
  position: absolute; box-sizing: border-box; width: 140px; height: 72px; padding: 8px 10px; border-radius: 10px;
  background: var(--panel); border: 1.5px solid #4a4a53; display: flex; flex-direction: column; gap: 2px; overflow: hidden;
  &.run { border-color: #4ade80; }
  &.wait { border-color: #fbbf24; background: #221d12; }
  &.plan { border-style: dashed; border-color: #6b6b75; background: transparent; }
  &.alert { border-style: dashed; border-color: #fca5a5; background: #251516; }
}
.top { display: flex; align-items: center; gap: 8px; }
.label { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sub { font-size: 11px; color: #c9c6bf; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.meta { font-size: 11px; color: var(--muted-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.flow { stroke-dasharray: 6 6; animation: dash 1s linear infinite; }
@keyframes dash { to { stroke-dashoffset: -12; } }
@media (prefers-reduced-motion: reduce) { .flow { animation: none; } }
</style>
