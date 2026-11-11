<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import type { Session } from '../shared/types';
import MdText from './MdText.vue';

const props = defineProps<{ session: Session; focused: boolean }>();
const emit = defineEmits<{
  (e: 'focus'): void;
  (e: 'close'): void;
  (e: 'decide', result: '' | 'approved' | 'rejected'): void;
  (e: 'ask', text: string): void;
  (e: 'answer', askId: string, allow: boolean): void;
}>();

const LABEL = { run: 'Travaille', wait: 'Attend ta validation', done: 'Terminé', plan: 'Plan à valider' };

const saved = computed(() => props.session.path.startsWith('sessions/'));
const live = computed(() => props.session.id.startsWith('live-'));
const canAsk = computed(() => saved.value && !!props.session.claudeSessionId);
const msg = ref('');

function ask() {
  const t = msg.value.trim();
  if (!t || !canAsk.value) return;
  emit('ask', t);
  msg.value = '';
}

interface Msg { role: 'user' | 'ai'; text: string }

/** La conversation : ta demande, la réponse, puis chaque échange de suivi écrit dans le fichier de la session. */
const messages = computed<Msg[]>(() => {
  const s = props.session;
  const out: Msg[] = [];
  if (s.ask) out.push({ role: 'user', text: s.ask });
  const parts = s.body.split(/^## Suivi : (.*)$/m);
  const first = parts[0].trim();
  const answer = first || [s.recapTitle, ...s.recap.map((r) => '- ' + r)].filter(Boolean).join('\n');
  if (answer) out.push({ role: 'ai', text: answer });
  for (let i = 1; i < parts.length; i += 2) {
    out.push({ role: 'user', text: parts[i].trim() });
    const reply = (parts[i + 1] ?? '').trim();
    if (reply) out.push({ role: 'ai', text: reply });
  }
  return out;
});

const scroller = ref<HTMLElement | null>(null);
function toBottom() {
  void nextTick(() => { if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight; });
}
onMounted(toBottom);
watch(() => [props.session.id, props.session.body, props.session.recapTitle, props.session.recap.length], toBottom);
</script>

<template>
  <section class="pane">
    <div class="head">
      <button class="vh" :class="{ sel: focused }" :aria-pressed="focused" @click="$emit('focus')">
        <span class="line">
          <span class="dot" :class="session.status" aria-hidden="true" />
          <strong>{{ session.name }}</strong>
          <span class="mono branch">{{ session.branch }}</span>
        </span>
        <span class="line small">
          <span>{{ LABEL[session.status] }}</span>
          <span class="mono push">{{ session.tokens }} / 200k · {{ session.elapsed }}</span>
        </span>
      </button>
      <button class="close" :aria-label="`Fermer le volet ${session.name}`" @click="$emit('close')">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" /></svg>
      </button>
    </div>

    <div ref="scroller" class="body" tabindex="0" aria-label="Conversation" role="log">
      <div class="route"><span class="chipb wf">{{ session.workflow }}</span><span>{{ session.route }}</span></div>

      <div v-for="(m, i) in messages" :key="i" class="msg" :class="m.role">
        <span class="who">{{ m.role === 'user' ? 'Toi' : 'Claude' }}</span>
        <div class="bubble"><MdText :text="m.text" /></div>
      </div>

      <div v-if="live && session.status === 'run'" class="msg ai">
        <span class="who">Claude</span>
        <div class="bubble typing"><span class="dots" aria-label="Claude travaille"><i /><i /><i /></span><span class="acts">{{ session.actions }}</span></div>
      </div>
      <div v-if="live && session.recap.length" class="tools mono">
        <span v-for="(r, i) in session.recap" :key="i">{{ r }}</span>
      </div>
      <div v-else-if="!live" class="actions">{{ session.actions }}, repliées · <span class="mono">{{ session.recapNote }}</span></div>

      <div v-for="a in session.pending" :key="a.id" class="ask-card" role="alert">
        <span class="ask-title">{{ a.kind === 'human' ? a.title : 'Claude veut utiliser : ' + a.title }}</span>
        <pre v-if="a.detail" class="ask-detail mono">{{ a.detail }}</pre>
        <div class="row">
          <button class="btn ok big" @click="$emit('answer', a.id, true)">{{ a.kind === 'human' ? 'Valider' : 'Autoriser' }}</button>
          <button class="btn danger big" @click="$emit('answer', a.id, false)">Refuser</button>
        </div>
      </div>

      <div v-if="session.decision && session.decisionResult" class="banner" :class="session.decisionResult === 'approved' ? 'ok' : 'fail'">
        <span>{{ session.decisionResult === 'approved' ? 'Validé' : 'Refusé' }}. Le workflow reprendra quand le moteur sera branché.</span>
        <button class="btn small" @click="$emit('decide', '')">Annuler</button>
      </div>
      <div v-else-if="session.decision" class="decision">
        <span>{{ session.decision }}</span>
        <div class="row">
          <button class="btn ok big" :disabled="!saved" @click="$emit('decide', 'approved')">{{ session.primary || 'Valider' }}</button>
          <button class="btn danger big" :disabled="!saved" @click="$emit('decide', 'rejected')">{{ session.secondary || 'Refuser' }}</button>
        </div>
      </div>
    </div>

    <div class="foot">
      <form class="composer" @submit.prevent="ask">
        <textarea
          v-model="msg" rows="1" :aria-label="`Message pour ${session.name}`" :disabled="!canAsk"
          :placeholder="live ? 'Claude travaille…' : canAsk ? 'Écris à Claude' : 'Session close, ouvre-en une avec +'"
          @keydown.enter.exact.prevent="ask"
        />
        <button class="send" type="submit" aria-label="Envoyer" title="Envoyer (Entrée)" :disabled="!canAsk || !msg.trim()">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 13V3M3.5 7.5L8 3l4.5 4.5" /></svg>
        </button>
      </form>
    </div>
  </section>
</template>

<style scoped lang="scss">
:where(button:not(.btn, .chipb)) { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; text-align: left; padding: 0; }
.pane { flex: 1 1 0; min-width: 0; min-height: 0; display: flex; flex-direction: column; background: var(--bg); }
.head { flex: none; display: flex; align-items: stretch; }
.vh {
  flex: 1; display: flex; flex-direction: column; gap: 6px; padding: 12px 16px; border-bottom: 1px solid var(--line); min-width: 0;
  &:hover { background: var(--panel); }
  &.sel { background: #1b1b1f; box-shadow: inset 0 -2px 0 var(--clay); }
}
.line { display: flex; align-items: center; gap: 10px; min-width: 0; &.small { font-size: 12px; color: var(--muted-2); } }
.branch { font-size: 11px; color: var(--muted-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.push { margin-left: auto; }
.close { flex: none; width: 44px; display: flex; align-items: center; justify-content: center; border-bottom: 1px solid var(--line); color: var(--muted); }
.body { flex: 1 1 0; min-height: 0; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 16px; }
.route { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; font-size: 12px; color: var(--muted-2); }
.wf { height: 28px; color: var(--blue); border-color: #2f4a73; }
.msg { display: flex; flex-direction: column; gap: 4px; max-width: 100%;
  .who { font-size: 11px; color: var(--muted); padding: 0 4px; }
  .bubble { border-radius: 14px; padding: 10px 14px; border: 1px solid var(--line); }
  &.user { align-items: flex-end; .who { text-align: right; } .bubble { max-width: 88%; background: #2b1d17; border-color: #5a3a2c; color: #f4e4dc; border-bottom-right-radius: 4px; } }
  &.ai { align-items: flex-start; .bubble { max-width: 100%; background: var(--panel); border-bottom-left-radius: 4px; } }
}
.typing { display: flex; align-items: center; gap: 12px; }
.acts { font-size: 12px; color: var(--muted); }
.dots { display: inline-flex; gap: 4px; i { width: 6px; height: 6px; border-radius: 50%; background: var(--muted-2); animation: bounce 1.2s infinite ease-in-out; &:nth-child(2) { animation-delay: .15s; } &:nth-child(3) { animation-delay: .3s; } } }
@keyframes bounce { 0%, 60%, 100% { opacity: .3; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-3px); } }
@media (prefers-reduced-motion: reduce) { .dots i { animation: none; } }
.tools { display: flex; flex-direction: column; gap: 2px; font-size: 11px; color: var(--muted); }
.actions { font-size: 12px; color: var(--muted); padding: 0 4px; }
.ask-card { padding: 12px; border-radius: 10px; background: #221d12; border: 1px solid #6b5316; display: flex; flex-direction: column; gap: 10px; }
.ask-title { font-weight: 500; color: var(--warn); font-size: 13px; }
.ask-detail { margin: 0; font-size: 12px; color: var(--text); background: #0b0b0d; border-radius: 8px; padding: 8px 10px; white-space: pre-wrap; max-height: 160px; overflow: auto; }
.decision { padding: 12px; border-radius: 10px; background: #221d12; border: 1px solid #6b5316; display: flex; flex-direction: column; gap: 10px; }
.decision > span { font-weight: 500; color: var(--warn); font-size: 13px; }
.row { display: flex; flex-wrap: wrap; gap: 8px; }
.big { height: 44px; padding: 0 16px; border-radius: 10px; }
.foot { flex: none; padding: 10px 16px 14px; border-top: 1px solid var(--line); }
.composer {
  display: flex; align-items: flex-end; gap: 8px; background: var(--panel); border: 1px solid var(--line-2); border-radius: 22px; padding: 6px 6px 6px 16px;
  &:focus-within { border-color: var(--clay); }
  textarea { flex: 1; min-width: 0; resize: none; border: 0; outline: 0; background: none; color: var(--text); font: inherit; line-height: 32px; max-height: 120px; padding: 0; field-sizing: content; &:disabled { color: var(--muted); } }
}
.send {
  flex: none; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  background: var(--clay); color: #1a1210;
  &:disabled { background: var(--panel-2); color: var(--muted); cursor: default; }
}
</style>
