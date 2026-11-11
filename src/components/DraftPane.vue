<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue';
import { useProject } from '../composables/useProject';
import AiSuggest from './AiSuggest.vue';
import type { RouteResult } from '../shared/types';

const props = defineProps<{ focused: boolean; busy: boolean; error: string; initial?: string; initialWorkflow?: string }>();
const emit = defineEmits<{ (e: 'focus'): void; (e: 'close'): void; (e: 'send', text: string, workflow: string, route?: { confidence: number; text: string }): void }>();
const { data } = useProject();
/** « auto » : le routeur lit le prompt et choisit. Vide : agent libre. */
const workflow = ref(props.initialWorkflow || 'auto');
const routing = ref(false);
const routeError = ref('');
const proposal = ref<RouteResult | null>(null);
const pick = ref('');

const text = ref(props.initial ?? '');
const input = ref<HTMLTextAreaElement | null>(null);
onMounted(() => nextTick(() => input.value?.focus()));

function launch(wf: string, r: RouteResult | null, how: string) {
  const t = text.value.trim();
  if (!t) return;
  emit('send', t, wf, r ? { confidence: r.confidence, text: how } : undefined);
}

async function send() {
  const t = text.value.trim();
  if (!t || routing.value) return;
  routeError.value = '';
  proposal.value = null;
  if (workflow.value !== 'auto') { emit('send', t, workflow.value); return; }
  routing.value = true;
  try {
    const r = await window.api.routePrompt(t);
    if (r.action === 'run') launch(r.workflow, r, `routeur ${r.confidence} %, lancé sans confirmation`);
    else if (r.action === 'free') launch('', r, 'aucun workflow ne convient, agent libre');
    else { proposal.value = r; pick.value = r.workflow; }
  } catch {
    routeError.value = "Le routeur n'a pas répondu. Choisis le workflow à la main ci-dessous, ou réessaie.";
  } finally {
    routing.value = false;
  }
}

function confirmRoute() {
  const r = proposal.value;
  if (!r) return;
  const same = pick.value === r.workflow;
  launch(pick.value, r, same ? `routeur ${r.confidence} %, confirmé par toi` : `routeur ${r.confidence} %, workflow changé par toi`);
}
</script>

<template>
  <section class="pane">
    <div class="head">
      <button class="vh" :class="{ sel: focused }" :aria-pressed="focused" @click="emit('focus')">
        <span class="line"><span class="dot todo" aria-hidden="true" /><strong>Nouvelle session</strong></span>
        <span class="line small">Pas encore lancée</span>
      </button>
      <button class="close" aria-label="Fermer ce volet" @click="emit('close')">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" /></svg>
      </button>
    </div>
    <div class="body">
      <label for="draft-prompt" class="title">Que veux-tu demander à Claude ?</label>
      <div class="composer">
        <textarea
          id="draft-prompt" ref="input" v-model="text" rows="4" placeholder="Décris la tâche"
          @keydown.enter.exact.prevent="send"
        />
        <button class="send" aria-label="Envoyer à Claude" title="Envoyer (Entrée)" :disabled="busy || routing || !text.trim()" @click="send">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 13V3M3.5 7.5L8 3l4.5 4.5" /></svg>
        </button>
      </div>
      <AiSuggest kind="draft" field="prompt" :context="{ Workflow: (data?.workflows ?? []).find((w) => w.id === workflow)?.name ?? 'Libre' }" :current="text" @use="text = $event" />
      <label for="draft-wf" class="small">Workflow</label>
      <select id="draft-wf" v-model="workflow" class="wfsel" @change="proposal = null">
        <option value="auto">Automatique : le routeur choisit selon ton prompt</option>
        <option value="">Libre : un seul agent, tu valides chaque modification</option>
        <option v-for="w in data?.workflows ?? []" :key="w.id" :value="w.id">{{ w.name }} : {{ w.when }}</option>
      </select>
      <span class="small">Entrée pour envoyer, Maj Entrée pour un retour à la ligne. Claude lit librement. Chaque modification ou commande te demande ton accord.</span>
      <p v-if="routing" class="small" role="status">Le routeur lit ton prompt.</p>
      <section v-if="proposal" class="proposal" aria-label="Choix du routeur">
        <strong>{{ proposal.action === 'ask' ? 'Aucun workflow ne convient clairement' : 'Le routeur propose : ' + proposal.name }}</strong>
        <span class="small">Confiance {{ proposal.confidence }} %. {{ proposal.reason }}</span>
        <label for="draft-pick" class="small">Lancer avec</label>
        <select id="draft-pick" v-model="pick" class="wfsel">
          <option value="">Agent libre</option>
          <option v-for="w in data?.workflows ?? []" :key="w.id" :value="w.id">{{ w.name }}</option>
        </select>
        <div class="acts">
          <button class="btn main" :disabled="busy" @click="confirmRoute">Lancer</button>
          <button class="btn" @click="proposal = null">Modifier mon prompt</button>
        </div>
      </section>
      <p v-if="routeError" class="err" role="alert">{{ routeError }}</p>
      <p v-if="error" class="err" role="alert">{{ error }}</p>
    </div>
  </section>
</template>

<style scoped lang="scss">
:where(button:not(.btn, .chipb)) { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; text-align: left; padding: 0; }
.pane { flex: 1 1 0; min-width: 0; min-height: 0; display: flex; flex-direction: column; background: var(--bg); }
.head { flex: none; display: flex; align-items: stretch; }
.title { font-size: 15px; font-weight: 600; }
.vh { flex: 1; display: flex; flex-direction: column; gap: 6px; padding: 12px 16px; border-bottom: 1px solid var(--line); &.sel { background: #1b1b1f; box-shadow: inset 0 -2px 0 var(--clay); } }
.line { display: flex; align-items: center; gap: 10px; &.small { font-size: 12px; color: var(--muted-2); } }
.close { flex: none; width: 44px; display: flex; align-items: center; justify-content: center; border-bottom: 1px solid var(--line); color: var(--muted); }
.body { flex: 1 1 0; min-height: 0; padding: 20px 16px; gap: 12px; display: flex; flex-direction: column; gap: 10px; overflow: auto; }
.small:not(.btn) { font-size: 12px; color: var(--muted); }
.wfsel { height: 40px; background: var(--panel); border: 1px solid var(--line-2); border-radius: 8px; color: var(--text); font: inherit; font-size: 13px; padding: 0 10px; }
.composer { display: flex; align-items: flex-end; gap: 8px; background: var(--panel); border: 1px solid var(--line-2); border-radius: 18px; padding: 10px 10px 10px 16px; &:focus-within { border-color: var(--clay); } }
textarea { flex: 1; min-width: 0; resize: none; border: 0; outline: 0; background: none; color: var(--text); font: inherit; font-size: 14px; line-height: 1.5; min-height: 80px; padding: 0; }
.send { flex: none; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--clay); color: #1a1210; &:disabled { background: var(--panel-2); color: var(--muted); cursor: default; } }
.proposal { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; background: var(--panel); border: 1px solid var(--line-2); border-radius: 10px; }
.acts { display: flex; gap: 8px; }
.err { margin: 0; color: var(--fail); font-size: 13px; }
</style>
