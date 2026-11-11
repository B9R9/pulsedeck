<script setup lang="ts">
import { computed } from 'vue';
import type { CostNode } from '../shared/types';

const props = defineProps<{ nodes: CostNode[]; edges: [string, string][] }>();

const W = 140;
const H = 72;
const CX = 165;
const LS = 92;

const HEAT = {
  hi: { bg: '#3a1f14', border: '#e8845c', style: 'solid' },
  mid: { bg: '#2a2316', border: '#b98b3c', style: 'solid' },
  lo: { bg: '#17171a', border: '#4a4a53', style: 'solid' },
  script: { bg: 'transparent', border: '#7db4ff', style: 'dashed' },
  human: { bg: '#221d12', border: '#fbbf24', style: 'solid' }
};

const placed = computed(() => props.nodes.map((n) => ({ ...n, left: n.c * CX, top: n.l * LS, ...HEAT[n.heat] })));

const links = computed(() => {
  const byId = new Map(placed.value.map((n) => [n.id, n]));
  return props.edges.flatMap(([a, b]) => {
    const A = byId.get(a);
    const B = byId.get(b);
    if (!A || !B) return [];
    const x1 = A.left + W;
    const y1 = A.top + H / 2;
    const top = Math.min(y1, B.top + H / 2) - 6;
    const w = B.left - x1;
    const h = Math.abs(B.top - A.top) + 12;
    const sy = y1 - top;
    const ey = B.top + H / 2 - top;
    return [{
      key: a + b, left: x1, top, w, h,
      d: `M 0 ${sy} C ${w / 2} ${sy}, ${w / 2} ${ey}, ${w - 4} ${ey} M ${w - 11} ${ey - 5} L ${w - 3} ${ey} L ${w - 11} ${ey + 5}`
    }];
  });
});

const width = computed(() => Math.max(0, ...placed.value.map((n) => n.left + W)) + 8);
const height = computed(() => Math.max(0, ...placed.value.map((n) => n.top + H)) + 8);
</script>

<template>
  <div :style="{ position: 'relative', width: width + 'px', height: height + 'px' }">
    <svg
      v-for="k in links" :key="k.key" :width="k.w" :height="k.h" aria-hidden="true"
      :style="{ position: 'absolute', left: k.left + 'px', top: k.top + 'px', overflow: 'visible' }"
    >
      <path :d="k.d" fill="none" stroke="#6b6b75" stroke-width="2" />
    </svg>
    <div
      v-for="n in placed" :key="n.id" class="node"
      :style="{ left: n.left + 'px', top: n.top + 'px', background: n.bg, borderColor: n.border, borderStyle: n.style }"
    >
      <span class="label">{{ n.label }}</span>
      <span class="mono cost">{{ n.cost }}</span>
      <span class="meta">{{ n.meta }}</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.node { position: absolute; box-sizing: border-box; width: 140px; height: 72px; padding: 8px 10px; border-radius: 10px; border-width: 1.5px; display: flex; flex-direction: column; gap: 2px; overflow: hidden; }
.label { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cost { font-size: 12px; }
.meta { font-size: 11px; color: var(--muted-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
