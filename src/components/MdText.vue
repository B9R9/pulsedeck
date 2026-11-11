<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ text: string }>();

type Seg = { t: 'text' | 'code' | 'bold'; v: string };
type Block =
  | { k: 'code'; v: string }
  | { k: 'h'; v: Seg[] }
  | { k: 'li'; v: Seg[] }
  | { k: 'p'; v: Seg[] };

function inline(line: string): Seg[] {
  return line.split(/(`[^`]+`|\*\*[^*]+\*\*)/).filter(Boolean).map((part) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return { t: 'code', v: part.slice(1, -1) };
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return { t: 'bold', v: part.slice(2, -2) };
    return { t: 'text', v: part };
  });
}

const blocks = computed<Block[]>(() => {
  const out: Block[] = [];
  let code: string[] | null = null;
  for (const raw of props.text.split('\n')) {
    if (raw.trim().startsWith('```')) {
      if (code) { out.push({ k: 'code', v: code.join('\n') }); code = null; } else code = [];
      continue;
    }
    if (code) { code.push(raw); continue; }
    if (!raw.trim()) continue;
    if (/^#{1,6}\s/.test(raw)) out.push({ k: 'h', v: inline(raw.replace(/^#{1,6}\s+/, '')) });
    else if (/^\s*([-*]|\d+\.)\s/.test(raw)) out.push({ k: 'li', v: inline(raw.replace(/^\s*([-*]|\d+\.)\s+/, '')) });
    else out.push({ k: 'p', v: inline(raw) });
  }
  if (code) out.push({ k: 'code', v: code.join('\n') });
  return out;
});
</script>

<template>
  <div class="mdtext">
    <template v-for="(b, i) in blocks" :key="i">
      <pre v-if="b.k === 'code'" class="code mono">{{ b.v }}</pre>
      <component :is="b.k === 'h' ? 'h4' : 'p'" v-else :class="{ li: b.k === 'li' }">
        <template v-for="(s, j) in b.v" :key="j">
          <code v-if="s.t === 'code'" class="inl mono">{{ s.v }}</code>
          <strong v-else-if="s.t === 'bold'">{{ s.v }}</strong>
          <template v-else>{{ s.v }}</template>
        </template>
      </component>
    </template>
  </div>
</template>

<style scoped lang="scss">
.mdtext { display: flex; flex-direction: column; gap: 8px; font-size: 14px; line-height: 1.55; overflow-wrap: anywhere; }
p, h4 { margin: 0; }
h4 { font-size: 14px; font-weight: 600; }
.li { padding-left: 16px; position: relative; &::before { content: '·'; position: absolute; left: 4px; } }
.code { margin: 0; font-size: 12px; line-height: 1.6; color: #bbd7ff; background: #0b0b0d; border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; white-space: pre; overflow-x: auto; }
.inl { font-size: 12.5px; color: #f3b79e; background: #0b0b0d; border-radius: 4px; padding: 1px 5px; }
</style>
