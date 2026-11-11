import { computed, reactive, ref } from 'vue';
import type { PendingAsk, RunEvent, Session, TreeEdge, TreeNode } from '../shared/types';
import { useProject } from './useProject';

interface LiveRun {
  id: string;
  prompt: string;
  status: 'run' | 'error';
  texts: string[];
  tools: string[];
  denied: string[];
  startedAt: number;
  error: string;
  /** Chemin de la session poursuivie, vide pour une nouvelle session. */
  followUp: string;
  label: string;
  workflow: string;
  nodes: TreeNode[];
  edges: TreeEdge[];
  asks: PendingAsk[];
}

const runs = reactive<LiveRun[]>([]);
/** Dernière session terminée : l'identifiant en direct et celui du fichier écrit, pour que la page suive le changement. */
const finished = ref<{ liveId: string; sessionId: string } | null>(null);
let subscribed = false;

const ensure = (id: string): LiveRun => {
  let run = runs.find((r) => r.id === id);
  if (!run) {
    run = { id, prompt: '', status: 'run', texts: [], tools: [], denied: [], startedAt: Date.now(), error: '', followUp: '', label: '', workflow: '', nodes: [], edges: [], asks: [] };
    runs.push(run);
  }
  return run;
};

function subscribe(reload: () => Promise<void>) {
  if (subscribed) return;
  subscribed = true;
  window.api.onRunEvent((event: RunEvent) => {
    const run = ensure(event.runId);
    if (event.kind === 'text') run.texts.push(event.text);
    else if (event.kind === 'tool') run.tools.push(event.detail ? `${event.name} : ${event.detail}` : event.name);
    else if (event.kind === 'denied') run.denied.push(event.name);
    else if (event.kind === 'workflow') { run.workflow = event.name; run.nodes = event.nodes; run.edges = event.edges; }
    else if (event.kind === 'node') {
      const n = run.nodes.find((x) => x.id === event.nodeId);
      if (n) { n.state = event.state; n.meta = event.meta; }
    } else if (event.kind === 'ask') run.asks.push({ id: event.id, kind: event.ask, title: event.title, detail: event.detail });
    else if (event.kind === 'asked') run.asks = run.asks.filter((a) => a.id !== event.id);
    else if (event.kind === 'error') {
      run.status = 'error';
      run.error = event.message;
    } else if (event.kind === 'done') {
      void reload().then(() => {
        const i = runs.findIndex((r) => r.id === event.runId);
        if (i >= 0) runs.splice(i, 1);
        finished.value = { liveId: 'live-' + event.runId, sessionId: event.file.replace(/^sessions\//, '').replace(/\.md$/, '') };
      });
    }
  });
}

function toSession(r: LiveRun): Session {
  const failed = r.status === 'error';
  const last = r.texts[r.texts.length - 1] ?? '';
  const firstLine = last.split('\n').find((l) => l.trim()) ?? '';
  const seconds = Math.max(1, Math.round((Date.now() - r.startedAt) / 1000));
  return {
    path: '', id: 'live-' + r.id, name: r.label || r.workflow || r.prompt.split(/\s+/).slice(0, 4).join(' ') || 'Session en cours', branch: '', status: failed ? 'done' : r.asks.length ? 'wait' : 'run',
    task: r.prompt.slice(0, 60), tokens: '…', elapsed: seconds + ' s', ask: r.prompt,
    actions: r.tools.length + (r.tools.length > 1 ? ' actions' : ' action'),
    workflow: r.workflow || 'Libre', workflowVersion: '', confidence: 0, route: r.workflow ? 'workflow lancé à la main' : 'lancée à la main, chaque modification demande ton accord',
    recapLabel: failed ? 'Erreur' : 'Récap en cours',
    recapTitle: failed ? r.error : firstLine.slice(0, 140) || 'Claude lit le projet…',
    recap: [...r.tools.slice(-5), ...r.denied.map((d) => `Refusé : ${d} (lecture seule)`)],
    recapNote: 'Le récap sera écrit dans sessions/ à la fin de la session', decision: '', primary: '', secondary: '',
    nodes: r.nodes.length ? r.nodes : [
      { id: 'prompt', c: 0, l: 0, state: 'done', label: 'Ton prompt', sub: r.prompt.slice(0, 20), meta: '' },
      { id: 'agent', c: 1, l: 0, state: failed ? 'alert' : 'run', label: 'Agent libre', sub: 'avec tes accords', meta: r.tools.length + ' actions' },
      { id: 'recap', c: 2, l: 0, state: 'plan', label: 'Récap', sub: 'résumé final', meta: '' }
    ],
    edges: r.nodes.length ? r.edges : [['prompt', 'agent'], ['agent', 'recap']], pending: r.asks, choices: [], decisionResult: '', decidedAt: '', claudeSessionId: '', body: r.texts.join('\n\n')
  };
}

export function useRuns() {
  const { reload } = useProject();
  subscribe(reload);
  return {
    finished,
    liveSessions: computed(() => runs.map(toSession)),
    /** Pour une session en direct qui poursuit une session existante : le chemin de celle-ci, sinon vide. */
    followOf: (liveId: string) => runs.find((r) => 'live-' + r.id === liveId)?.followUp ?? '',
    running: computed(() => runs.filter((r) => r.status === 'run').map((r) => ({ id: r.id, prompt: r.prompt }))),
    async start(prompt: string, followUp = '', label = '', workflow = '', route?: { confidence: number; text: string }): Promise<string> {
      const id = await window.api.startRun(prompt, followUp || undefined, workflow || undefined, route);
      const run = ensure(id);
      run.prompt = prompt;
      run.followUp = followUp;
      run.label = label;
      return 'live-' + id;
    },
    answer: (liveId: string, askId: string, allow: boolean) => window.api.answerAsk(liveId.replace(/^live-/, ''), askId, allow),
    stop: (liveId: string) => window.api.stopRun(liveId.replace(/^live-/, ''))
  };
}
