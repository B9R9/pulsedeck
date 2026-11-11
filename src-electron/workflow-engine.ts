import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { ArchNode, NodeState, RunEvent, TreeEdge, TreeNode } from '../src/shared/types';
import { ask, runAgent } from './claude-runner';
import { loadProject, writeInboxAlert, writeSessionFile } from './project-store';
import { MODEL_IDS } from './models';
import { recordVersion } from './versions';
import { fmtDuration, fmtK, refreshStats } from './stats';

const MODELS = MODEL_IDS;
const TOOL_MAP: Record<string, string[]> = { 'Lecture': [], 'Édition': ['Edit', 'Write'], 'Commandes': ['Bash'] };
const MAX_STEPS = 60;
const SCRIPT_TIMEOUT_MS = 5 * 60 * 1000;

type Outcome = 'ok' | 'fail' | 'blocked';

interface Options {
  runId: string;
  root: string;
  cwd: string;
  prompt: string;
  workflowId: string;
  emit: (e: RunEvent) => void;
  abort: AbortSignal;
  route?: { confidence: number; text: string };
}

const clip = (s: string, n: number) => (s.length > n ? '…' + s.slice(-n) : s);

/** Colonne = profondeur la plus longue depuis le début, ligne = champ `l` du nœud. */
function layout(nodes: ArchNode[], edges: [string, string, string][]) {
  const depth = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  for (let pass = 0; pass < nodes.length; pass++) {
    for (const [a, b] of edges) depth.set(b, Math.max(depth.get(b) ?? 0, (depth.get(a) ?? 0) + 1));
  }
  return depth;
}

export async function runWorkflow(o: Options): Promise<void> {
  const started = Date.now();
  const project = loadProject(o.root);
  const found = project.workflows.find((w) => w.id === o.workflowId);
  if (!found) throw new Error('Workflow introuvable : ' + o.workflowId);
  const wf = found;
  // La version qui tourne : un instantané est pris si le workflow a changé depuis la dernière.
  let version = '';
  try { version = recordVersion(o.root, wf.id).name; } catch { /* sans version enregistrée, le workflow tourne quand même */ }
  const byId = new Map(wf.nodes.map((n) => [n.id, n]));
  const edges = wf.edges;
  const depth = layout(wf.nodes, edges);

  const state = new Map<string, NodeState>(wf.nodes.map((n) => [n.id, 'plan']));
  const meta = new Map<string, string>();
  const tree = (): TreeNode[] => wf.nodes.map((n) => ({
    id: n.id, c: depth.get(n.id) ?? 0, l: Math.max(0, (n.l || 1) - 1), state: state.get(n.id) ?? 'plan',
    label: n.label || n.id, sub: n.type === 'agent' ? n.model : n.type === 'script' ? n.command.slice(0, 22) : n.type === 'human' ? 'décision' : 'alerte',
    meta: meta.get(n.id) ?? ''
  }));
  const treeEdges = (): TreeEdge[] => edges.map(([a, b, k]) => (k === 'ok' ? [a, b] : [a, b, k]) as TreeEdge);

  const set = (id: string, s: NodeState, m = '') => {
    state.set(id, s);
    if (m) meta.set(id, m);
    o.emit({ runId: o.runId, kind: 'node', nodeId: id, state: s, meta: meta.get(id) ?? '' });
  };

  o.emit({ runId: o.runId, kind: 'workflow', name: wf.name, nodes: tree(), edges: treeEdges() });

  const outputs: { label: string; text: string }[] = [];
  const bricks = new Map<string, { kind: string; label: string }>();
  let lastAttempts = 1;
  let tokens = 0;
  let actions = 0;
  let costUsd = 0;
  let sessionId = '';
  let stopped = false;
  let failedAt = '';

  const readDocs = (n: ArchNode) => n.docs.filter((d) => d.role !== 'write').flatMap((d) => {
    const full = path.resolve(o.root, d.path);
    if (!full.startsWith(path.resolve(o.root) + path.sep) || !fs.existsSync(full)) return [];
    return [`--- Document ${d.path} ---\n${fs.readFileSync(full, 'utf8').slice(0, 6000)}`];
  });

  async function runAgentNode(n: ArchNode): Promise<Outcome> {
    const attempts = Math.max(1, n.retries || 1);
    const chain = [n.model, ...n.fallback].filter((m) => MODELS[m]);
    const tools = [...new Set(n.tools.flatMap((t) => TOOL_MAP[t] ?? []))];
    let last = '';
    for (let i = 0; i < attempts && !o.abort.aborted; i++) {
      lastAttempts = i + 1;
      const model = MODELS[chain[Math.min(i, chain.length - 1)] ?? ''] ?? undefined;
      set(n.id, 'run', attempts > 1 ? `essai ${i + 1} sur ${attempts}` : '');
      const writes = n.docs.filter((d) => d.role === 'write').map((d) => d.path);
      const prompt = [
        `Demande de l'utilisateur :\n${o.prompt}`,
        ...outputs.slice(-2).map((x) => `Résultat de l'étape « ${x.label} » :\n${clip(x.text, 3000)}`),
        ...readDocs(n),
        `Ta tâche (${n.label}) :\n${n.prompt}`,
        n.success ? `Critère de réussite : ${n.success}` : '',
        writes.length ? `Documents que tu dois mettre à jour : ${writes.join(', ')}.` : '',
        last ? `Ton essai précédent a échoué : ${last}` : '',
        "Termine ta réponse par une dernière ligne : « RÉSULTAT: OK », « RÉSULTAT: ÉCHEC : <raison> » ou « RÉSULTAT: BLOQUÉ : <raison> »."
      ].filter(Boolean).join('\n\n');
      const r = await runAgent({ runId: o.runId, prompt, cwd: o.cwd, tools, model, node: n.label || n.id, emit: o.emit });
      tokens += r.tokens; actions += r.actions; costUsd += r.costUsd;
      if (r.sessionId) sessionId = r.sessionId;
      const verdict = /RÉSULTAT\s*:\s*(OK|ÉCHEC|ECHEC|BLOQUÉ|BLOQUE)/i.exec(r.text);
      if (r.ok) outputs.push({ label: n.label, text: r.text });
      if (r.ok && (!verdict || /^OK$/i.test(verdict[1]))) return 'ok';
      if (r.ok && /BLOQU/i.test(verdict?.[1] ?? '')) return 'blocked';
      last = r.error || (r.text.split('\n').slice(-2).join(' ') ?? 'échec');
      if (o.abort.aborted) break;
    }
    failedAt = failedAt || `${n.label} : ${last || 'échec'}`;
    return 'fail';
  }

  /** Si la commande lance un script du projet, la demande d'accord en montre le contenu. */
  function withScriptContent(command: string, cwd: string): string {
    const m = /scripts\/([A-Za-z0-9_-]+\.(?:sh|mjs|py))/.exec(command);
    if (!m) return command;
    try { return command + '\n\n' + fs.readFileSync(path.join(cwd, 'scripts', m[1]), 'utf8').slice(0, 3000); } catch { return command; }
  }

  async function runScriptNode(n: ArchNode): Promise<Outcome> {
    const attempts = Math.max(1, n.retries || 1);
    const okToRun = await ask(o.runId, o.emit, 'permission', 'Script', withScriptContent(n.command, o.cwd));
    if (!okToRun) { failedAt = failedAt || `${n.label} : script refusé`; return 'fail'; }
    let tail = '';
    for (let i = 0; i < attempts && !o.abort.aborted; i++) {
      lastAttempts = i + 1;
      set(n.id, 'run', attempts > 1 ? `essai ${i + 1} sur ${attempts}` : '');
      const code = await new Promise<number>((resolve) => {
        const child = spawn('sh', ['-c', n.command], { cwd: o.cwd });
        let buf = '';
        const take = (d: Buffer) => { buf = clip(buf + d.toString(), 4000); tail = buf; };
        child.stdout.on('data', take);
        child.stderr.on('data', take);
        const kill = () => child.kill('SIGTERM');
        const timer = setTimeout(kill, SCRIPT_TIMEOUT_MS);
        o.abort.addEventListener('abort', kill, { once: true });
        child.on('close', (c) => { clearTimeout(timer); resolve(c ?? 1); });
        child.on('error', (e) => { tail = e.message; clearTimeout(timer); resolve(1); });
      });
      if (code === 0) { outputs.push({ label: n.label, text: tail }); return 'ok'; }
    }
    failedAt = failedAt || `${n.label} : ${tail.split('\n').slice(-3).join(' ').slice(0, 200)}`;
    return 'fail';
  }

  /** Exécute une étape puis note son coût et sa durée, dans le même format que les récaps (« 18k · 3 min · 2 essais »). */
  async function execute(n: ArchNode): Promise<Outcome> {
    const t0 = Date.now();
    const tok0 = tokens;
    lastAttempts = 1;
    const outcome = await executeStep(n);
    const ms = Date.now() - t0;
    if (n.type === 'human') meta.set(n.id, 'attente ' + fmtDuration(ms));
    else if (n.type === 'agent' || n.type === 'script') {
      meta.set(n.id, [tokens > tok0 ? fmtK(tokens - tok0) : '', fmtDuration(ms), lastAttempts > 1 ? `${lastAttempts} essais` : ''].filter(Boolean).join(' · '));
    }
    return outcome;
  }

  async function executeStep(n: ArchNode): Promise<Outcome> {
    if (n.type === 'agent') {
      for (const s of n.skills) bricks.set('Skill|' + s, { kind: 'Skill', label: s });
      for (const d of n.docs) bricks.set('Doc|' + d.path, { kind: 'Doc', label: d.path });
      return runAgentNode(n);
    }
    if (n.type === 'script') return runScriptNode(n);
    if (n.type === 'human') {
      set(n.id, 'wait');
      const yes = await ask(o.runId, o.emit, 'human', n.label || 'Ta validation', outputs.length ? clip(outputs[outputs.length - 1].text, 1500) : '');
      return yes ? 'ok' : 'fail';
    }
    // alerte : prévient l'utilisateur dans « À traiter » puis s'arrête là
    writeInboxAlert(o.root, { project: path.basename(o.root), title: `${wf.name} : ${n.label}`, detail: failedAt || 'Un lien d\'échec ou bloqué est arrivé ici.' });
    return 'ok';
  }

  const incoming = new Set(edges.map((e) => e[1]));
  const queue = wf.nodes.filter((n) => !incoming.has(n.id)).map((n) => n.id);
  let steps = 0;
  let alerted = false;

  while (queue.length && !o.abort.aborted && steps++ < MAX_STEPS) {
    const id = queue.shift() as string;
    const n = byId.get(id);
    if (!n || (state.get(id) !== 'plan' && n.type !== 'alert')) continue;
    const outcome = await execute(n);
    if (n.type === 'alert') { set(id, 'alert'); alerted = true; continue; }
    set(id, outcome === 'ok' ? 'done' : 'alert');
    const next = edges.filter(([a, , k]) => a === id && k === outcome).map((e) => e[1]);
    if (!next.length && outcome !== 'ok') {
      // Pas de lien prévu pour ce cas : on prévient quand même, sinon l'échec passerait inaperçu.
      writeInboxAlert(o.root, { project: path.basename(o.root), title: `${wf.name} : ${n.label} a échoué`, detail: failedAt || 'Étape refusée ou en échec.' });
      alerted = true;
    }
    queue.push(...next);
  }

  stopped = o.abort.aborted;
  if (stopped) throw new Error('Session arrêtée.');

  const finalStates = tree();
  const doneAll = finalStates.every((s) => s.state === 'done' || s.state === 'plan') && !alerted;
  const answer = [
    doneAll ? `Workflow « ${wf.name} » terminé.` : `Workflow « ${wf.name} » arrêté : ${failedAt || 'voir les alertes'}`,
    ...outputs.map((x) => `- ${x.label} : ${clip(x.text, 300).replace(/\s+/g, ' ')}`)
  ].join('\n');
  const file = writeSessionFile(o.root, {
    prompt: o.prompt, answer, cwd: o.cwd, tokens, durationMs: Date.now() - started, actions, claudeSessionId: sessionId,
    workflow: { name: wf.name, status: doneAll ? 'done' : 'wait', nodes: finalStates, edges: treeEdges(), version },
    bricks: [...bricks.values()],
    route: o.route
  });
  refreshStats(o.root);
  o.emit({ runId: o.runId, kind: 'done', tokens, costUsd, durationMs: Date.now() - started, file });
}
