import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { listScripts } from './scripts';
import { metaOf, versionStats } from './versions';
import { listSubagents } from './subagents';
import { ago, taskHash } from './units';
import type {
  ArchEdge, ArchNode, ArchSettings, BackgroundTask, McpCall, WorkflowVersion, ArchType, CostNode, Cycle, InstructionFile, LibraryNode, WorkflowDef, DocFile, Feat, InboxItem, InboxKind, NodeState, NoteFile, PlanChoice, ProjectData, Pulse, PulseState,
  Session, SessionStatus, StatsData, TreeEdge, TreeNode
} from '../src/shared/types';

const STATES: PulseState[] = ['todo', 'plan', 'run', 'wait', 'done'];
const SESSION_STATUS: SessionStatus[] = ['run', 'wait', 'done', 'plan'];
const INBOX_KINDS: InboxKind[] = ['alert', 'valid', 'plan', 'memo', 'doc', 'bg'];
const NODE_STATES: NodeState[] = ['done', 'run', 'wait', 'plan', 'alert'];

function listMarkdown(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listMarkdown(full));
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out.sort();
}

function read(file: string) {
  const parsed = matter(fs.readFileSync(file, 'utf8'));
  return { data: parsed.data as Record<string, unknown>, body: parsed.content.trim() };
}

const str = (v: unknown, fallback = ''): string => (v == null ? fallback : String(v));

/** Dit si l'utilisateur a approuvé cette tâche de fond (l'accord vit hors du projet, dans les données de l'app). */
let approvalOf: (root: string, id: string, hash: string) => boolean = () => false;
export function setApprovalProvider(fn: (root: string, id: string, hash: string) => boolean) { approvalOf = fn; }

export function emptyProject(root: string): ProjectData {
  return { root, exists: false, cycles: [], feats: [], pulses: [], docs: [], sessions: [], inbox: [], stats: null, workflows: [], library: [], instructions: [], background: [], archSettings: defaultSettings(), mcp: [], versions: {}, memory: [], scripts: [], subagents: [] };
}

const HEATS = ['hi', 'mid', 'lo', 'script', 'human'];
const LEVELS = ['Élevé', 'Moyen', 'Faible'];
const KINDS = ['agent', 'script', 'human'];
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
const list = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.map(rec) : []);
const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Lit stats/usage.md, écrit par le futur script collecteur. Renvoie null si le fichier n'existe pas. */
function loadStats(file: string): StatsData | null {
  if (!fs.existsSync(file)) return null;
  const { data } = read(file);
  const session = rec(data.session);
  const nodes: CostNode[] = list(session.nodes).map((n) => ({
    id: str(n.id), c: num(n.c), l: num(n.l), label: str(n.label), cost: str(n.cost), meta: str(n.meta),
    heat: (HEATS.includes(str(n.heat)) ? str(n.heat) : 'lo') as CostNode['heat']
  }));
  const edges = (Array.isArray(session.edges) ? session.edges : [])
    .filter((e): e is unknown[] => Array.isArray(e) && e.length >= 2)
    .map((e) => [String(e[0]), String(e[1])] as [string, string]);
  const spent: Record<string, number> = {};
  for (const [k, v] of Object.entries(rec(data.featSpent))) spent[k] = num(v);
  return {
    period: str(data.period), kpis: list(data.kpis).map((k) => ({ label: str(k.label), value: str(k.value), note: str(k.note) })),
    session: { name: str(session.name), nodes, edges, worstTitle: str(session.worstTitle), worstText: str(session.worstText) },
    saved: list(data.saved).map((r) => ({ label: str(r.label), k: num(r.k) })),
    brickTotal: num(data.brickTotal),
    bricks: list(data.bricks).map((b) => ({ kind: str(b.kind), label: str(b.label), count: num(b.count) })),
    brickAlert: str(data.brickAlert), featSpent: spent, cycleLabel: str(data.cycleLabel), cycleBudget: num(data.cycleBudget),
    forecast: str(data.forecast), weeks: list(data.weeks).map((w) => ({ label: str(w.label), value: num(w.value) })),
    gantt: list(data.gantt).map((g) => ({
      label: str(g.label), start: num(g.start), end: num(g.end),
      kind: (KINDS.includes(str(g.kind)) ? str(g.kind) : 'agent') as StatsData['gantt'][number]['kind']
    })),
    ganttMax: num(data.ganttMax) || 1,
    issues: list(data.issues).map((i) => ({
      title: str(i.title), level: (LEVELS.includes(str(i.level)) ? str(i.level) : 'Faible') as StatsData['issues'][number]['level'], text: str(i.text)
    }))
  };
}

function defaultSettings(): ArchSettings {
  return { router: 'Haiku 5.5', confirm: 'always', noMatch: 'plan', bgCap: 50, samples: [], candidates: [] };
}

function loadSettings(file: string): ArchSettings {
  const base = defaultSettings();
  if (!fs.existsSync(file)) return base;
  const { data } = read(file);
  const confirm = str(data.confirm, base.confirm);
  const noMatch = str(data.noMatch, base.noMatch);
  return {
    router: str(data.router, base.router),
    confirm: (['always', 'under', 'never'].includes(confirm) ? confirm : base.confirm) as ArchSettings['confirm'],
    noMatch: (['plan', 'free', 'ask'].includes(noMatch) ? noMatch : base.noMatch) as ArchSettings['noMatch'],
    bgCap: num(data.bgCap) || base.bgCap,
    samples: list(data.samples).map((x) => ({
      text: str(x.text), wf: str(x.wf), conf: num(x.conf),
      picks: (Array.isArray(x.picks) ? x.picks : []).filter(Array.isArray).map((p) => [str(p[0]), str(p[1])] as [string, string])
    })),
    candidates: list(data.candidates).map((x) => ({ id: str(x.id), text: str(x.text), savedK: num(x.savedK) }))
  };
}

const ARCH_TYPES = ['agent', 'script', 'human', 'alert'];
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

function archFields(d: Record<string, unknown>, libId: string): Omit<ArchNode, 'id' | 'l' | 'c'> {
  const type = (ARCH_TYPES.includes(str(d.type)) ? str(d.type) : 'agent') as ArchType;
  const slot = rec(d.slot);
  return {
    type, label: str(d.label), libId, model: str(d.model), effort: str(d.effort), command: str(d.command),
    isolated: d.isolated === true, retries: num(d.retries) || 1, budget: str(d.budget), cond: str(d.cond, 'Toujours'),
    skills: strs(d.skills), plugins: strs(d.plugins), tools: strs(d.tools),
    docs: list(d.docs).map((x) => ({ path: str(x.path), role: str(x.role) === 'write' ? 'write' as const : 'read' as const })),
    prompt: str(d.prompt), success: str(d.success), purposes: strs(d.purposes), fallback: strs(d.fallback),
    slot: slot.on === undefined ? null : { on: slot.on === true, skills: strs(slot.skills), docs: strs(slot.docs), agents: strs(slot.agents) }
  };
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.quasar']);

/** CLAUDE.md à la racine du projet et dans ses sous-dossiers directs. */
function loadInstructions(root: string): InstructionFile[] {
  const out: InstructionFile[] = [];
  const add = (rel: string, scope: string) => {
    const full = path.join(root, rel);
    if (fs.existsSync(full)) out.push({ path: rel, scope, text: fs.readFileSync(full, 'utf8') });
  };
  add('CLAUDE.md', 'Tout le projet');
  if (!fs.existsSync(root)) return out;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory() && !entry.name.startsWith('.') && !SKIP_DIRS.has(entry.name)) {
      add(path.join(entry.name, 'CLAUDE.md'), 'Dossier ' + entry.name);
    }
  }
  return out;
}

/** Enregistre un CLAUDE.md. Refuse tout autre nom de fichier ou tout chemin hors du projet. */
export function saveInstruction(root: string, relPath: string, text: string): ProjectData {
  const full = path.resolve(root, relPath);
  const inside = path.relative(root, full);
  if (path.basename(full) !== 'CLAUDE.md' || inside.startsWith('..') || path.isAbsolute(inside) || inside.split(path.sep).length > 2) {
    throw new Error('Chemin refusé : ' + relPath);
  }
  fs.writeFileSync(full, text);
  return loadProject(root);
}

export function loadProject(root: string): ProjectData {
  if (!fs.existsSync(root)) return emptyProject(root);
  const rel = (file: string) => path.relative(root, file);
  const files = (sub: string) => listMarkdown(path.join(root, sub));

  const cycles: Cycle[] = files('cycles').map((file) => {
    const { data } = read(file);
    return {
      id: str(data.id, path.basename(file, '.md')), parent: str(data.parent), docs: strs(data.docs), title: str(data.title), period: str(data.period),
      state: str(data.state), file: rel(file)
    };
  });

  const feats: Feat[] = files('feats').map((file) => {
    const { data } = read(file);
    return {
      id: str(data.id, path.basename(file, '.md')), parent: str(data.parent), docs: strs(data.docs), title: str(data.title), cycle: str(data.cycle),
      goal: str(data.goal), spec: str(data.spec),
      budget: typeof data.budget === 'number' ? data.budget : null, file: rel(file)
    };
  });

  const pulses: Pulse[] = files('pulses').map((file) => {
    const { data, body } = read(file);
    const state = str(data.state, 'todo') as PulseState;
    return {
      id: str(data.id, path.basename(file, '.md')), parent: str(data.parent), docs: strs(data.docs), title: str(data.title), feat: str(data.feat),
      workflow: str(data.workflow), state: STATES.includes(state) ? state : 'todo',
      session: str(data.session), note: body, file: rel(file)
    };
  });

  const docs: DocFile[] = files('docs').map((file) => {
    const { data, body } = read(file);
    return {
      path: rel(file), title: str(data.title, path.basename(file, '.md')), type: str(data.type, 'guide'),
      project: str(data.project), updated: str(data.updated), body
    };
  });

  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

  const session = (file: string): Session => {
    const { data, body } = read(file);
    const status = str(data.status, 'done') as SessionStatus;
    const nodes: TreeNode[] = arr(data.nodes).map((raw) => {
      const n = raw as Record<string, unknown>;
      const state = str(n.state, 'plan') as NodeState;
      return {
        id: str(n.id), c: Number(n.c ?? 0), l: Number(n.l ?? 0),
        state: NODE_STATES.includes(state) ? state : 'plan',
        label: str(n.label), sub: str(n.sub), meta: str(n.meta)
      };
    });
    const edges: TreeEdge[] = arr(data.edges).flatMap((raw) => {
      if (!Array.isArray(raw) || raw.length < 2) return [];
      const [a, b, kind] = raw.map(String);
      return [kind === 'fail' || kind === 'blocked' ? [a, b, kind] as TreeEdge : [a, b] as TreeEdge];
    });
    const choices: PlanChoice[] = arr(data.choices).map((raw) => {
      const c = raw as Record<string, unknown>;
      return {
        node: str(c.node),
        picks: arr(c.picks).map((p) => {
          const q = p as Record<string, unknown>;
          return { id: str(q.id), kind: str(q.kind), label: str(q.label), why: str(q.why), off: q.off === true };
        })
      };
    });
    return {
      path: rel(file), id: str(data.id, path.basename(file, '.md')), name: str(data.name, path.basename(file, '.md')),
      branch: str(data.branch), status: SESSION_STATUS.includes(status) ? status : 'done',
      task: str(data.task), tokens: str(data.tokens), elapsed: str(data.elapsed), ask: str(data.ask),
      actions: str(data.actions), workflow: str(data.workflow), confidence: Number(data.confidence ?? 0),
      route: str(data.route), recapLabel: str(data.recapLabel, 'Récap'), recapTitle: str(data.recapTitle),
      recap: arr(data.recap).map(String), recapNote: str(data.recapNote), decision: str(data.decision),
      primary: str(data.primary), secondary: str(data.secondary), nodes, edges, choices,
      decisionResult: (['approved', 'rejected'].includes(str(data.decisionResult)) ? str(data.decisionResult) : '') as Session['decisionResult'],
      decidedAt: str(data.decidedAt), claudeSessionId: str(data.claudeSessionId), workflowVersion: str(data.workflowVersion), pending: [], body
    };
  };

  const note = (file: string): NoteFile => {
    const { data, body } = read(file);
    const meta: Record<string, string> = {};
    for (const [k, v] of Object.entries(data)) meta[k] = str(v);
    return { path: rel(file), title: str(data.title, path.basename(file, '.md')), meta, body };
  };

  const inbox: InboxItem[] = files('inbox').map((file) => {
    const { data } = read(file);
    const kind = str(data.kind, 'valid') as InboxKind;
    return {
      path: rel(file), id: str(data.id, path.basename(file, '.md')), kind: INBOX_KINDS.includes(kind) ? kind : 'valid',
      project: str(data.project), title: str(data.title), when: str(data.when), detail: str(data.detail),
      primary: str(data.primary), target: str(data.target), secondary: str(data.secondary), workflow: str(data.workflow), prompt: str(data.prompt), done: data.done === true,
      result: (['approved', 'rejected'].includes(str(data.result)) ? str(data.result) : '') as InboxItem['result']
    };
  });

  const libFiles = files('library').map((file) => ({ path: rel(file), id: path.basename(file, '.md'), data: read(file).data }));
  const libById = new Map(libFiles.map((l) => [l.id, l.data]));
  const library: LibraryNode[] = libFiles.map((l) => ({ path: l.path, ...archFields(l.data, l.id) }));
  const workflows: WorkflowDef[] = files('workflows').map((file) => {
    const { data } = read(file);
    const nodes: ArchNode[] = list(data.nodes).map((n) => {
      const libId = str(n.libId);
      const base = libId ? libById.get(libId) ?? {} : {};
      return { id: str(n.id), c: typeof n.c === 'number' ? n.c : null, l: num(n.l), ...archFields({ ...base, ...n }, libId) };
    });
    const edges: ArchEdge[] = (Array.isArray(data.edges) ? data.edges : [])
      .filter((e): e is unknown[] => Array.isArray(e) && e.length >= 2)
      .map((e) => [String(e[0]), String(e[1]), ['fail', 'blocked'].includes(String(e[2])) ? String(e[2]) : 'ok'] as ArchEdge);
    return { path: rel(file), id: str(data.id, path.basename(file, '.md')), name: str(data.name), when: str(data.when), nodes, edges };
  });
  const instructions = loadInstructions(root);
  const background: BackgroundTask[] = files('background').map((file) => {
    const { data } = read(file);
    const type = str(data.type, 'script');
    return {
      path: rel(file), id: str(data.id, path.basename(file, '.md')), name: str(data.name), what: str(data.what), trigger: str(data.trigger),
      type: (['script', 'agent', 'both'].includes(type) ? type : 'script') as BackgroundTask['type'], cost: str(data.cost), last: ago(str(data.lastRun)) || str(data.last),
      savedK: num(data.savedK), launchable: data.launchable === true, launch: str(data.launch), active: data.active !== false,
      command: str(data.command), prompt: str(data.prompt),
      approved: approvalOf(root, str(data.id, path.basename(file, '.md')), taskHash({ type: str(data.type, 'script'), command: str(data.command).trim(), prompt: str(data.prompt).trim() })),
      lastRun: str(data.lastRun), lastResult: (['ok', 'fail', 'skipped'].includes(str(data.lastResult)) ? str(data.lastResult) : '') as BackgroundTask['lastResult'], lastOutput: str(data.lastOutput)
    };
  });
  const archSettings = loadSettings(path.join(root, 'settings.md'));
  const mcpFile = path.join(root, 'logs', 'mcp.md');
  const mcp: McpCall[] = fs.existsSync(mcpFile)
    ? (Array.isArray(read(mcpFile).data.calls) ? (read(mcpFile).data.calls as unknown[][]) : []).filter(Array.isArray).map((c) => ({
      time: str(c[0]), server: str(c[1]), action: str(c[2]), node: str(c[3]), project: str(c[4]), kind: str(c[5]), result: str(c[6])
    }))
    : [];
  const allSessions = files('sessions').map(session);
  const versions: Record<string, WorkflowVersion[]> = {};
  for (const file of files('versions')) {
    const { data } = read(file);
    const wfId = path.basename(file, '.md');
    const wfName = workflows.find((w) => w.id === wfId)?.name ?? '';
    versions[wfId] = list(data.versions).map((v) => {
      const given = (Array.isArray(v.stats) ? v.stats : []).filter(Array.isArray).map((x) => ({ label: str(x[0]), value: str(x[1]), hint: str(x[2]) }));
      return {
        name: str(v.name), tag: str(v.tag), change: str(v.change), meta: metaOf(v), restorable: typeof v.snapshot === 'string' && v.snapshot.length > 0,
        stats: given.length ? given : versionStats(allSessions, wfName, str(v.name))
      };
    });
  }
  const stats = loadStats(path.join(root, 'stats', 'usage.md'));

  return {
    root, exists: true, cycles, feats, pulses, docs,
    sessions: allSessions, inbox, stats, workflows, library, instructions, background, archSettings, mcp, versions, memory: files('memory').map(note), scripts: listScripts(root), subagents: listSubagents(root, workflows)
  };
}

/** Champs modifiables depuis l'interface, par fichier. Tout le reste est refusé. */
const PATCHABLE: { match: (rel: string) => boolean; keys: Record<string, (v: unknown) => boolean> }[] = [
  {
    match: (rel) => rel === 'settings.md',
    keys: {
      confirm: (v) => ['always', 'under', 'never'].includes(String(v)),
      noMatch: (v) => ['plan', 'free', 'ask'].includes(String(v)),
      bgCap: (v) => typeof v === 'number' && v >= 1 && v <= 10000
    }
  },
  {
    match: (rel) => /^background\/[^/]+\.md$/.test(rel),
    keys: { active: (v) => typeof v === 'boolean', launch: (v) => typeof v === 'string' && /^[a-z0-9-]{0,40}$/.test(v) }
  }
];

/** Modifie quelques champs de l'en-tête d'un fichier markdown autorisé, sans toucher au reste. */
export function patchFile(root: string, relPath: string, patch: Record<string, unknown>): ProjectData {
  const full = path.resolve(root, relPath);
  const rel = path.relative(root, full).split(path.sep).join('/');
  const rule = PATCHABLE.find((r) => r.match(rel));
  if (!rule || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Chemin refusé : ' + relPath);
  for (const [k, v] of Object.entries(patch)) {
    if (!rule.keys[k] || !rule.keys[k](v)) throw new Error('Champ refusé : ' + k);
  }
  const parsed = fs.existsSync(full) ? matter(fs.readFileSync(full, 'utf8')) : matter('');
  Object.assign(parsed.data, patch);
  fs.writeFileSync(full, matter.stringify(parsed.content, parsed.data));
  return loadProject(root);
}

export interface RunSummary {
  prompt: string;
  answer: string;
  cwd: string;
  tokens: number;
  durationMs: number;
  actions: number;
  claudeSessionId?: string;
  /** Pour un workflow : son nom, l'état final de chaque étape et le statut de la session. */
  workflow?: { name: string; status: 'done' | 'wait'; nodes: unknown[]; edges: unknown[]; version?: string };
  /** Skills et documents utilisés par les étapes, pour les stats. */
  bricks?: { kind: string; label: string }[];
  /** Choix du routeur, quand le workflow n'a pas été imposé à la main. */
  route?: { confidence: number; text: string };
}

/** Écrit le récap d'une session lancée depuis l'application dans sessions/. Renvoie le chemin relatif. */
export function writeSessionFile(root: string, run: RunSummary): string {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const slug = run.prompt.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'session';
  const dir = path.join(root, 'sessions');
  fs.mkdirSync(dir, { recursive: true });
  let name = `${day}-${slug}.md`;
  for (let i = 2; fs.existsSync(path.join(dir, name)); i++) name = `${day}-${slug}-${i}.md`;
  const lines = run.answer.split('\n').map((l) => l.replace(/^[-*#\s]+/, '').trim()).filter(Boolean);
  const minutes = run.durationMs / 60000;
  const data = {
    id: path.basename(name, '.md'),
    name: path.basename(run.cwd) || 'session',
    branch: '',
    status: run.workflow?.status ?? 'done',
    pulse: '',
    task: run.prompt.slice(0, 80),
    tokens: run.tokens >= 1000 ? Math.round(run.tokens / 1000) + 'k' : String(run.tokens),
    elapsed: minutes >= 1 ? Math.round(minutes) + ' min' : Math.max(1, Math.round(run.durationMs / 1000)) + ' s',
    ask: run.prompt,
    actions: run.actions + (run.actions > 1 ? ' actions' : ' action'),
    workflow: run.workflow?.name ?? 'Libre',
    confidence: run.route?.confidence ?? 0,
    route: run.route?.text ?? (run.workflow ? 'workflow lancé à la main' : 'lancée à la main, sans routeur'),
    recapLabel: 'Récap',
    recapTitle: (lines[0] ?? 'Session terminée').slice(0, 140),
    recapNote: 'Récap dans sessions/' + name + ', écrit à la fin de la session',
    decision: '',
    primary: '',
    secondary: '',
    recap: lines.slice(1, 7).map((l) => l.slice(0, 200)),
    nodes: run.workflow?.nodes ?? [
      { id: 'prompt', c: 0, l: 0, state: 'done', label: 'Ton prompt', sub: run.prompt.slice(0, 20), meta: '' },
      { id: 'agent', c: 1, l: 0, state: 'done', label: 'Agent libre', sub: 'avec tes accords', meta: run.actions + ' actions' },
      { id: 'recap', c: 2, l: 0, state: 'done', label: 'Récap', sub: 'résumé final', meta: '' }
    ],
    edges: run.workflow?.edges ?? [['prompt', 'agent'], ['agent', 'recap']],
    claudeSessionId: run.claudeSessionId ?? '',
    workflowVersion: run.workflow?.version ?? '',
    startedAt: new Date(now.getTime() - run.durationMs).toISOString(),
    tokenCount: run.tokens,
    durationMs: run.durationMs,
    bricks: run.bricks ?? []
  };
  fs.writeFileSync(path.join(dir, name), matter.stringify(run.answer.trim() + '\n', data));
  return 'sessions/' + name;
}

/** Lit l'identifiant Claude d'une session enregistrée, pour la poursuivre. */
export function readClaudeSessionId(root: string, relPath: string): string {
  const full = path.resolve(root, relPath);
  if (!full.startsWith(path.resolve(root, 'sessions') + path.sep) || !full.endsWith('.md') || !fs.existsSync(full)) return '';
  return String(matter(fs.readFileSync(full, 'utf8')).data.claudeSessionId ?? '');
}

/** Ajoute un échange (question de suivi et réponse) à une session enregistrée et met son récap à jour. */
export function appendFollowUp(root: string, relPath: string, run: RunSummary): string {
  const full = path.resolve(root, relPath);
  if (!full.startsWith(path.resolve(root, 'sessions') + path.sep) || !fs.existsSync(full)) throw new Error('Session introuvable');
  const parsed = matter(fs.readFileSync(full, 'utf8'));
  const data = parsed.data as Record<string, unknown>;
  const lines = run.answer.split('\n').map((l) => l.replace(/^[-*#\s]+/, '').trim()).filter(Boolean);
  data.status = 'done';
  data.recapTitle = (lines[0] ?? 'Session terminée').slice(0, 140);
  data.recap = lines.slice(1, 7).map((l) => l.slice(0, 200));
  data.actions = run.actions + (run.actions > 1 ? ' actions' : ' action');
  if (run.claudeSessionId) data.claudeSessionId = run.claudeSessionId;
  const body = parsed.content.trim() + '\n\n## Suivi : ' + run.prompt.trim().slice(0, 200) + '\n\n' + run.answer.trim() + '\n';
  fs.writeFileSync(full, matter.stringify(body, data));
  return relPath;
}

/** Crée une alerte dans inbox/ (le seul moyen pour un workflow de te prévenir). */
export function writeInboxAlert(root: string, alert: { project: string; title: string; detail: string }): string {
  return writeInboxItem(root, { kind: 'alert', ...alert, primary: 'Ouvrir la session', target: 'developpement', secondary: 'Marquer comme vu' });
}

/** Crée une demande dans inbox/. `workflow` et `prompt` permettent de lancer un workflow depuis « À traiter », avec ton accord. */
export function writeInboxItem(root: string, item: {
  kind: InboxKind; project: string; title: string; detail: string; primary: string; target: string; secondary: string; workflow?: string; prompt?: string;
}): string {
  const alert = item;
  const dir = path.join(root, 'inbox');
  fs.mkdirSync(dir, { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  const slug = alert.title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'alerte';
  let name = `${day}-${slug}.md`;
  for (let i = 2; fs.existsSync(path.join(dir, name)); i++) name = `${day}-${slug}-${i}.md`;
  const data = {
    id: path.basename(name, '.md'), kind: alert.kind, project: alert.project, title: alert.title, when: "à l'instant",
    detail: alert.detail.slice(0, 600), primary: alert.primary, target: alert.target, secondary: alert.secondary, done: false,
    ...(alert.workflow ? { workflow: alert.workflow, prompt: String(alert.prompt ?? '').slice(0, 1500) } : {})
  };
  fs.writeFileSync(path.join(dir, name), matter.stringify('', data));
  return 'inbox/' + name;
}
