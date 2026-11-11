<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ArchEdge, ArchNode } from '../shared/types';
import { LOCAL_MODELS } from '../shared/entities';

/**
 * Grille du workflow. Une case fait CX par ROW pixels ; un nœud occupe une colonne et deux demi-lignes.
 * On y dépose des nœuds de la bibliothèque, on déplace les nœuds (ils s'aimantent à la case la plus proche)
 * et on relie deux nœuds en tirant la poignée de droite de l'un vers l'autre.
 */
const props = defineProps<{ nodes: ArchNode[]; edges: ArchEdge[]; selected: string }>();
const emit = defineEmits<{
  (e: 'select', id: string): void;
  (e: 'drop', payload: { libId?: string; type?: string; nodeId?: string; c: number; l: number }): void;
  (e: 'link', from: string, to: string): void;
}>();

const W = 128;
const H = 72;
const CX = 164;
const LANE = 92;
const ROW = LANE / 2;
const PAD = 24;

const KIND = {
  ok: { stroke: '#86efac', dash: 'none', label: 'succès' },
  fail: { stroke: '#fca5a5', dash: '6 4', label: 'échec' },
  blocked: { stroke: '#fcd34d', dash: '2 4', label: 'bloqué' }
};
const LOCAL = LOCAL_MODELS;

/** Colonne de repli pour les anciens fichiers sans colonne : la profondeur dans le graphe. */
const depthOf = computed(() => {
  const parents = new Map<string, string[]>(props.nodes.map((n) => [n.id, []]));
  for (const [a, b] of props.edges) parents.get(b)?.push(a);
  const col = new Map<string, number>();
  const depth = (id: string, seen: string[] = []): number => {
    const known = col.get(id);
    if (known !== undefined) return known;
    if (seen.includes(id)) return 0;
    const ps = parents.get(id) ?? [];
    const d = ps.length ? Math.max(...ps.map((p) => depth(p, [...seen, id]))) + 1 : 0;
    col.set(id, d);
    return d;
  };
  return depth;
});

const placed = computed(() => props.nodes.map((n) => {
  const parts: string[] = [];
  if (n.libId) parts.push('lié');
  if (n.isolated) parts.push('branche isolée');
  if (n.slot?.on) parts.push('adaptatif');
  if (n.docs.length) parts.push(n.docs.length + (n.docs.length > 1 ? ' docs' : ' doc'));
  let sub = '';
  let meta = parts.length ? parts.join(' · ') : n.retries + (n.retries > 1 ? ' essais' : ' essai');
  if (n.type === 'agent') sub = n.model + (LOCAL.includes(n.model) ? ' · local' : ' · ' + n.effort);
  if (n.type === 'script') sub = n.command;
  if (n.type === 'human') { sub = "point d'arrêt"; meta = ''; }
  if (n.type === 'alert') { sub = "prévient l'app"; meta = 'notification'; }
  const c = n.c ?? depthOf.value(n.id);
  return { ...n, c, sub, meta, left: PAD + c * CX, top: PAD + n.l * LANE };
}));

const links = computed(() => {
  const byId = new Map(placed.value.map((n) => [n.id, n]));
  return props.edges.flatMap(([a, b, k]) => {
    const A = byId.get(a);
    const B = byId.get(b);
    if (!A || !B) return [];
    const ks = KIND[k];
    const x1 = A.left + W;
    const y1 = A.top + H / 2;
    const x2 = B.left;
    const y2 = B.top + H / 2;
    // Lien vers l'arrière ou la même colonne : on passe par une boucle au-dessus.
    const back = x2 <= x1;
    const d = back
      ? `M ${x1} ${y1} C ${x1 + 60} ${y1}, ${x1 + 60} ${Math.min(y1, y2) - 60}, ${(x1 + x2) / 2} ${Math.min(y1, y2) - 60} S ${x2 - 60} ${y2}, ${x2 - 4} ${y2}`
      : `M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2 - 4} ${y2}`;
    const arrow = `M ${x2 - 11} ${y2 - 5} L ${x2 - 3} ${y2} L ${x2 - 11} ${y2 + 5}`;
    return [{
      key: a + '>' + b, d, arrow, stroke: ks.stroke, dash: ks.dash, label: k === 'ok' ? '' : ks.label,
      lx: Math.round((x1 + x2) / 2 - 22), ly: Math.round(back ? Math.min(y1, y2) - 70 : (y1 + y2) / 2 - 10)
    }];
  });
});

const maxC = computed(() => Math.max(0, ...placed.value.map((n) => n.c)));
const maxL = computed(() => Math.max(0, ...placed.value.map((n) => n.l)));
// Toujours quelques colonnes et lignes libres à droite et en bas pour déposer.
const width = computed(() => PAD * 2 + (maxC.value + 4) * CX);
const height = computed(() => PAD * 2 + (maxL.value + 3) * LANE);

const board = ref<HTMLElement | null>(null);
const ghost = ref<{ c: number; l: number; ok: boolean } | null>(null);
const linking = ref('');

function toCell(e: DragEvent, grab = { x: W / 2, y: H / 2 }) {
  const r = board.value!.getBoundingClientRect();
  const x = e.clientX - r.left - PAD - grab.x;
  const y = e.clientY - r.top - PAD - grab.y;
  return { c: Math.max(0, Math.round(x / CX)), l: Math.max(0, Math.round(y / ROW) / 2) };
}
const free = (pos: { c: number; l: number }, except = '') => !placed.value.some((n) => n.id !== except && n.c === pos.c && Math.abs(n.l - pos.l) < 1);

let grab = { x: W / 2, y: H / 2 };
let moving = '';

function nodeDragStart(e: DragEvent, id: string) {
  const t = e.currentTarget as HTMLElement;
  const r = t.getBoundingClientRect();
  grab = { x: e.clientX - r.left, y: e.clientY - r.top };
  moving = id;
  e.dataTransfer?.setData('text/arch-node', id);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
}
function handleDragStart(e: DragEvent, id: string) {
  e.stopPropagation();
  linking.value = id;
  e.dataTransfer?.setData('text/arch-link', id);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'link';
}
function dragEnd() { ghost.value = null; linking.value = ''; moving = ''; }

const accepts = (e: DragEvent) => {
  const types = e.dataTransfer?.types ?? [];
  return types.includes('text/arch-lib') || types.includes('text/arch-type') || types.includes('text/arch-node');
};

function over(e: DragEvent) {
  if (linking.value || !accepts(e)) return;
  e.preventDefault();
  const fromBoard = (e.dataTransfer?.types ?? []).includes('text/arch-node');
  const pos = toCell(e, fromBoard ? grab : undefined);
  ghost.value = { ...pos, ok: free(pos, fromBoard ? moving : '') };
}
function drop(e: DragEvent) {
  e.preventDefault();
  const dt = e.dataTransfer;
  const g = ghost.value;
  ghost.value = null;
  if (!dt || !g || !g.ok) return;
  const node = dt.getData('text/arch-node');
  const lib = dt.getData('text/arch-lib');
  const type = dt.getData('text/arch-type');
  if (node) emit('drop', { nodeId: node, c: g.c, l: g.l });
  else if (lib) emit('drop', { libId: lib, c: g.c, l: g.l });
  else if (type) emit('drop', { type, c: g.c, l: g.l });
  moving = '';
}
function linkOver(e: DragEvent, id: string) {
  if (linking.value && linking.value !== id) e.preventDefault();
}
function linkDrop(e: DragEvent, id: string) {
  const from = e.dataTransfer?.getData('text/arch-link');
  if (!from) return;
  e.preventDefault();
  e.stopPropagation();
  linking.value = '';
  if (from !== id) emit('link', from, id);
}
</script>

<template>
  <div
    ref="board" class="board" :class="{ linking: !!linking }" :style="{ width: width + 'px', height: height + 'px', backgroundPosition: PAD + 'px ' + PAD + 'px' }"
    @dragover="over" @dragleave.self="ghost = null" @drop="drop"
  >
    <svg class="wires" :width="width" :height="height" aria-hidden="true">
      <g v-for="k in links" :key="k.key">
        <path :d="k.d" fill="none" :stroke="k.stroke" stroke-width="2" :stroke-dasharray="k.dash" />
        <path :d="k.arrow" fill="none" :stroke="k.stroke" stroke-width="2" />
      </g>
    </svg>
    <template v-for="k in links" :key="'l' + k.key">
      <span v-if="k.label" class="elabel" :style="{ left: k.lx + 'px', top: k.ly + 'px', color: k.stroke, borderColor: k.stroke }">{{ k.label }}</span>
    </template>

    <div
      v-if="ghost" class="ghost" :class="{ bad: !ghost.ok }" aria-hidden="true"
      :style="{ left: PAD + ghost.c * CX + 'px', top: PAD + ghost.l * LANE + 'px' }"
    />

    <div
      v-for="n in placed" :key="n.id" class="nodewrap" :style="{ left: n.left + 'px', top: n.top + 'px' }"
      @dragover="linkOver($event, n.id)" @drop="linkDrop($event, n.id)"
    >
      <button
        class="node" :class="[n.type, { sel: selected === n.id, target: linking && linking !== n.id }]" draggable="true"
        :aria-pressed="selected === n.id" :title="'Glisse pour déplacer ' + n.label"
        @click="emit('select', n.id)" @dragstart="nodeDragStart($event, n.id)" @dragend="dragEnd"
      >
        <span class="label">{{ n.label }}</span>
        <span class="sub mono">{{ n.sub }}</span>
        <span class="meta">{{ n.meta }}</span>
      </button>
      <span
        class="handle" draggable="true" role="img" :aria-label="'Relier ' + n.label + ' à une autre étape'"
        title="Tire vers une autre étape pour les relier" @dragstart="handleDragStart($event, n.id)" @dragend="dragEnd"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.board {
  position: relative; flex: none;
  background-image:
    linear-gradient(to right, rgba(255, 255, 255, .045) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(255, 255, 255, .045) 1px, transparent 1px);
  background-size: 164px 46px;
}
.wires { position: absolute; inset: 0; pointer-events: none; overflow: visible; }
.ghost { position: absolute; width: 128px; height: 72px; box-sizing: border-box; border-radius: 10px; border: 2px dashed var(--clay); background: rgba(232, 132, 92, .08); pointer-events: none;
  &.bad { border-color: var(--fail); background: rgba(252, 165, 165, .08); } }
.nodewrap { position: absolute; width: 128px; height: 72px; }
.node {
  position: absolute; inset: 0; box-sizing: border-box; padding: 8px 10px; border-radius: 10px; background: var(--panel);
  border: 1.5px solid #4a4a53; display: flex; flex-direction: column; gap: 2px; overflow: hidden; text-align: left; color: inherit; font: inherit; cursor: grab;
  &:hover { border-color: #8c8983; }
  &:active { cursor: grabbing; }
  &.sel { box-shadow: 0 0 0 2px var(--clay); border-color: var(--clay); }
  &.script { border-style: dashed; border-color: #7db4ff; }
  &.human { border-color: #fbbf24; background: #221d12; }
  &.alert { border-style: dashed; border-color: #fca5a5; background: #251516; }
  &.target { box-shadow: 0 0 0 2px #86efac; }
}
.handle {
  position: absolute; right: -7px; top: 50%; width: 14px; height: 14px; margin-top: -7px; border-radius: 50%; box-sizing: border-box;
  background: var(--bg); border: 2px solid var(--muted-2); cursor: crosshair; opacity: 0; transition: opacity .12s;
}
.nodewrap:hover .handle, .node.sel + .handle, .linking .handle { opacity: 1; }
.handle:hover { border-color: #86efac; background: #12261a; }
.label { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sub { font-size: 11px; color: #c9c6bf; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.meta { font-size: 11px; color: var(--muted-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.elabel { position: absolute; font-size: 11px; padding: 1px 8px; border-radius: 999px; background: var(--bg); border: 1px solid #4a4a53; white-space: nowrap; pointer-events: none; }
@media (prefers-reduced-motion: reduce) { .handle { transition: none; } }
</style>
