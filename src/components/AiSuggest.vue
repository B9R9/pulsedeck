<template>
  <div class="aisug">
    <button type="button" class="btn small" :aria-expanded="open" @click="toggle">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M6 0l1.4 4.1L11.5 5.5 7.4 6.9 6 11 4.6 6.9.5 5.5l4.1-1.4z" /></svg>
      <span>Suggérer avec l'IA</span>
    </button>
    <div v-if="open" class="panel" role="region" aria-label="Suggestion de l'IA">
      <div class="prec">
        <input v-model="instruction" class="precin" type="text" placeholder="Précision pour l'IA (facultatif)" aria-label="Précision pour l'IA" @keydown.enter.prevent="generate" />
        <button type="button" class="btn small" :disabled="busy" @click="generate">{{ result ? 'Refaire' : 'Générer' }}</button>
      </div>
      <p v-if="busy" class="wait" role="status">Le modèle lit le projet et rédige.</p>
      <p v-if="error" class="err" role="alert">{{ error }}</p>
      <pre v-if="result && !busy" class="out" :class="{ code: mono }">{{ result }}</pre>
      <div v-if="result && !busy" class="acts">
        <button type="button" class="btn small ok" @click="use">{{ current.trim() ? 'Remplacer le texte actuel' : 'Utiliser ce texte' }}</button>
        <button type="button" class="btn small" @click="open = false">Fermer</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  kind: string;
  field: string;
  /** Autres champs du formulaire, donnés à l'IA comme contexte. */
  context?: Record<string, unknown>;
  current: string;
  /** Résultat en police fixe (commande). */
  mono?: boolean;
}>();
const emit = defineEmits<{ (e: 'use', text: string): void }>();

const open = ref(false);
const busy = ref(false);
const result = ref('');
const error = ref('');
const instruction = ref('');
let ticket = 0;

const flat = (v: unknown): string => (Array.isArray(v) ? v.map(String).join(', ') : v === null || v === undefined || typeof v === 'object' ? '' : String(v));

async function generate() {
  const mine = ++ticket;
  busy.value = true;
  error.value = '';
  try {
    const context = Object.fromEntries(Object.entries(props.context ?? {}).map(([k, v]) => [k, flat(v)]).filter(([, v]) => v));
    const text = await window.api.suggestText({ kind: props.kind, field: props.field, context, current: props.current, instruction: instruction.value });
    if (mine === ticket) result.value = text;
  } catch (e) {
    if (mine === ticket) error.value = (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']*': (Error: )?/, '');
  } finally {
    if (mine === ticket) busy.value = false;
  }
}

function toggle() {
  open.value = !open.value;
  if (open.value && !result.value && !busy.value) void generate();
}

function use() {
  emit('use', result.value);
  open.value = false;
  result.value = '';
  instruction.value = '';
}
</script>

<style scoped lang="scss">
.aisug { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; margin-top: 6px; .btn svg { margin-right: 6px; color: var(--clay); } }
.panel { align-self: stretch; display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; background: var(--panel-2); border: 1px solid var(--line-2); border-radius: 10px; }
.prec { display: flex; gap: 8px; }
.precin { flex: 1; min-width: 0; height: 32px; padding: 0 10px; background: var(--bg); border: 1px solid var(--line-2); border-radius: 8px; color: var(--text); font: inherit; font-size: 12px; &:focus { outline: 0; border-color: var(--clay); } }
.wait { margin: 0; font-size: 12px; color: var(--muted-2); }
.err { margin: 0; font-size: 12px; color: var(--fail); }
.out { margin: 0; max-height: 260px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; font-size: 13px; line-height: 1.5; color: #d6d3cc; background: #141416; border-radius: 8px; padding: 10px 12px; &.code { font-family: 'JetBrains Mono', 'SF Mono', Menlo, monospace; font-size: 12px; color: var(--blue); } }
.acts { display: flex; gap: 8px; }
</style>
