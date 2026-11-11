export type PulseState = 'todo' | 'plan' | 'run' | 'wait' | 'done';

export interface Cycle {
  id: string;
  /** Lien de parent général : un autre ticket (cycle, feat, pulse ou clé Jira). */
  parent: string;
  /** Documents liés (chemins sous docs/). */
  docs: string[];
  title: string;
  period: string;
  state: string;
  file: string;
}

export interface Feat {
  id: string;
  /** Lien de parent général : un autre ticket (cycle, feat, pulse ou clé Jira). */
  parent: string;
  /** Documents liés (chemins sous docs/). */
  docs: string[];
  title: string;
  cycle: string;
  goal: string;
  spec: string;
  budget: number | null;
  file: string;
}

export interface Pulse {
  id: string;
  /** Lien de parent général : un autre ticket (cycle, feat, pulse ou clé Jira). */
  parent: string;
  /** Documents liés (chemins sous docs/). */
  docs: string[];
  title: string;
  feat: string;
  workflow: string;
  state: PulseState;
  session: string;
  note: string;
  file: string;
}

export interface DocFile {
  path: string;
  title: string;
  type: string;
  project: string;
  updated: string;
  body: string;
}

export interface NoteFile {
  path: string;
  title: string;
  meta: Record<string, string>;
  body: string;
}

export type NodeState = 'done' | 'run' | 'wait' | 'plan' | 'alert';
export type SessionStatus = 'run' | 'wait' | 'done' | 'plan';

export interface TreeNode {
  id: string;
  c: number;
  l: number;
  state: NodeState;
  label: string;
  sub: string;
  meta: string;
}

export type EdgeKind = 'fail' | 'blocked';
export type TreeEdge = [string, string] | [string, string, EdgeKind];

export interface PlanPick {
  id: string;
  kind: string;
  label: string;
  why: string;
  off: boolean;
}

export interface PlanChoice {
  node: string;
  picks: PlanPick[];
}

export interface Session {
  path: string;
  id: string;
  name: string;
  branch: string;
  status: SessionStatus;
  task: string;
  tokens: string;
  elapsed: string;
  ask: string;
  actions: string;
  workflow: string;
  confidence: number;
  route: string;
  recapLabel: string;
  recapTitle: string;
  recap: string[];
  recapNote: string;
  decision: string;
  primary: string;
  secondary: string;
  nodes: TreeNode[];
  edges: TreeEdge[];
  choices: PlanChoice[];
  decisionResult: '' | 'approved' | 'rejected';
  decidedAt: string;
  /** Identifiant de la conversation côté Claude : permet de la poursuivre. Vide pour les sessions écrites à la main. */
  claudeSessionId: string;
  /** Version du workflow utilisée (v7...), vide pour une session libre. */
  workflowVersion: string;
  /** Accords que la session en cours attend de toi (jamais écrit dans un fichier). */
  pending: PendingAsk[];
  body: string;
}

export type InboxKind = 'alert' | 'valid' | 'plan' | 'memo' | 'doc' | 'bg';

export interface InboxItem {
  path: string;
  id: string;
  kind: InboxKind;
  project: string;
  title: string;
  when: string;
  detail: string;
  primary: string;
  target: string;
  secondary: string;
  /** Workflow à lancer depuis cette demande, avec ton accord. */
  workflow: string;
  prompt: string;
  done: boolean;
  result: '' | 'approved' | 'rejected';
}

export type Heat = 'hi' | 'mid' | 'lo' | 'script' | 'human';

export interface CostNode {
  id: string;
  c: number;
  l: number;
  label: string;
  cost: string;
  meta: string;
  heat: Heat;
}

export interface StatsData {
  period: string;
  kpis: { label: string; value: string; note: string }[];
  session: {
    name: string;
    nodes: CostNode[];
    edges: [string, string][];
    worstTitle: string;
    worstText: string;
  };
  saved: { label: string; k: number }[];
  brickTotal: number;
  bricks: { kind: string; label: string; count: number }[];
  brickAlert: string;
  featSpent: Record<string, number>;
  cycleLabel: string;
  cycleBudget: number;
  forecast: string;
  weeks: { label: string; value: number }[];
  gantt: { label: string; start: number; end: number; kind: 'agent' | 'script' | 'human' }[];
  ganttMax: number;
  issues: { title: string; level: 'Élevé' | 'Moyen' | 'Faible'; text: string }[];
}

export type ArchType = 'agent' | 'script' | 'human' | 'alert';
export type ArchEdgeKind = 'ok' | 'fail' | 'blocked';

export interface ArchDocRef {
  path: string;
  role: 'read' | 'write';
}

export interface ArchSlot {
  on: boolean;
  skills: string[];
  docs: string[];
  agents: string[];
}

/** Un nœud de workflow. Les champs d'un nœud lié à la bibliothèque viennent de library/<libId>.md, le nœud peut les surcharger. */
export interface ArchNode {
  id: string;
  type: ArchType;
  label: string;
  /** Colonne dans la grille. null : calculée d'après les liens (anciens fichiers). */
  c: number | null;
  /** Ligne dans la grille, par pas de 0,5. */
  l: number;
  libId: string;
  model: string;
  effort: string;
  command: string;
  isolated: boolean;
  retries: number;
  budget: string;
  cond: string;
  skills: string[];
  plugins: string[];
  tools: string[];
  docs: ArchDocRef[];
  prompt: string;
  success: string;
  purposes: string[];
  fallback: string[];
  slot: ArchSlot | null;
}

export type ArchEdge = [string, string, ArchEdgeKind];

export interface WorkflowDef {
  path: string;
  id: string;
  name: string;
  when: string;
  nodes: ArchNode[];
  edges: ArchEdge[];
}

export interface LibraryNode extends Omit<ArchNode, 'id' | 'l' | 'c'> {
  path: string;
}

export interface InstructionFile {
  path: string;
  scope: string;
  text: string;
}

export interface BackgroundTask {
  path: string;
  id: string;
  name: string;
  what: string;
  trigger: string;
  type: 'script' | 'agent' | 'both';
  cost: string;
  last: string;
  savedK: number;
  launchable: boolean;
  launch: string;
  active: boolean;
  /** Script du dossier scripts/ lancé par la tâche. */
  command: string;
  /** Consigne de l'agent (types agent et script puis agent). */
  prompt: string;
  /** Tu as approuvé exactement ce que la tâche exécute : sans cela, elle ne tourne pas seule. */
  approved: boolean;
  lastRun: string;
  lastResult: '' | 'ok' | 'fail' | 'skipped';
  lastOutput: string;
}

export interface RouteResult {
  /** Identifiant du workflow choisi, vide si aucun ne convient. */
  workflow: string;
  name: string;
  confidence: number;
  reason: string;
  /** Ce que les réglages demandent de faire : lancer, confirmer, partir en agent libre ou demander. */
  action: 'run' | 'confirm' | 'free' | 'ask';
}

export interface RouteSample {
  text: string;
  wf: string;
  conf: number;
  picks: [string, string][];
}

export interface ArchSettings {
  router: string;
  confirm: 'always' | 'under' | 'never';
  noMatch: 'plan' | 'free' | 'ask';
  bgCap: number;
  samples: RouteSample[];
  candidates: { id: string; text: string; savedK: number }[];
}

export interface McpCall {
  time: string;
  server: string;
  action: string;
  node: string;
  project: string;
  kind: string;
  result: string;
}

export interface WorkflowVersion {
  name: string;
  tag: string;
  change: string;
  meta: string;
  /** Une copie du workflow existe : on peut y revenir. */
  restorable: boolean;
  stats: { label: string; value: string; hint: string }[];
}

/** Un sous-agent Claude Code (.claude/agents/) généré depuis une étape agent d'un workflow. */
export interface SubAgent {
  name: string;
  file: string;
  workflow: string;
  workflowName: string;
  node: string;
  label: string;
  tools: string[];
  model: string;
  /** missing : pas encore écrit. synced : identique. outdated : l'étape a changé ou le fichier a été modifié. conflict : un fichier à toi porte ce nom. orphan : l'étape n'existe plus. */
  state: 'missing' | 'synced' | 'outdated' | 'conflict' | 'orphan';
}

export interface ScriptFile {
  name: string;
  content: string;
  size: number;
  updated: string;
}

export interface ProjectData {
  root: string;
  exists: boolean;
  cycles: Cycle[];
  feats: Feat[];
  pulses: Pulse[];
  docs: DocFile[];
  sessions: Session[];
  inbox: InboxItem[];
  stats: StatsData | null;
  workflows: WorkflowDef[];
  library: LibraryNode[];
  instructions: InstructionFile[];
  background: BackgroundTask[];
  archSettings: ArchSettings;
  mcp: McpCall[];
  versions: Record<string, WorkflowVersion[]>;
  memory: NoteFile[];
  scripts: ScriptFile[];
  subagents: SubAgent[];
}

export interface PendingAsk {
  id: string;
  kind: 'permission' | 'human';
  title: string;
  detail: string;
}

export type RunEvent =
  | { runId: string; kind: 'text'; text: string }
  | { runId: string; kind: 'tool'; name: string; detail: string }
  | { runId: string; kind: 'denied'; name: string }
  | { runId: string; kind: 'workflow'; name: string; nodes: TreeNode[]; edges: TreeEdge[] }
  | { runId: string; kind: 'node'; nodeId: string; state: NodeState; meta: string }
  | { runId: string; kind: 'ask'; id: string; ask: 'permission' | 'human'; title: string; detail: string }
  | { runId: string; kind: 'asked'; id: string }
  | { runId: string; kind: 'done'; tokens: number; costUsd: number; durationMs: number; file: string }
  | { runId: string; kind: 'error'; message: string };

export interface Ticket {
  key: string;
  project: string;
  summary: string;
  type: string | null;
  status: string | null;
  statusCategory: string | null;
  priority: string | null;
  assignee: string | null;
  created: string;
  updated: string;
  /** Liens locaux, stockés dans links/tickets.json (le fichier Jira est réécrit à chaque export). */
  parent?: string;
  docs?: string[];
  /** Description écrite dans l'app (le fichier Jira n'en contient pas). */
  description?: string;
  /** Champs modifiés dans l'app par rapport au fichier Drive. */
  local?: string[];
  /** Ticket créé dans l'app : il n'existe pas dans Jira. */
  isLocal?: boolean;
}

export interface TicketEdits {
  summary?: string;
  description?: string;
  status?: string;
  priority?: string;
  assignee?: string;
  type?: string;
}

export interface TicketsData {
  file: string;
  origin: 'choisi' | 'drive' | 'projet' | 'aucun';
  exportedAt: string;
  readAt: string;
  tickets: Ticket[];
  /** Choix proposés dans les listes (pris dans les tickets existants). */
  statuses: { name: string; category: string }[];
  priorities: string[];
  types: string[];
  error: string;
}

export interface SplitProposal {
  /** Cycle à créer si la feat n'en a pas. */
  cycle: { title: string; period: string } | null;
  pulses: { title: string; workflow: string }[];
}

export interface SuggestRequest {
  /** Nature de l'objet : ticket, feat, pulse, doc, memory, library, node, draft... */
  kind: string;
  /** Champ à remplir : description, goal, body, command... */
  field: string;
  /** Autres champs du formulaire, pour donner du contexte. */
  context: Record<string, string>;
  /** Texte déjà saisi (vide pour une première version). */
  current: string;
  /** Précision facultative de l'utilisateur. */
  instruction: string;
}

export interface AppSettings {
  root: string;
  /** Fichier de tickets choisi à la main (vide : détection automatique). */
  ticketsChosen: string;
  ticketsFile: string;
  ticketsOrigin: 'choisi' | 'drive' | 'projet' | 'aucun';
  /** '' (défaut de Claude Code), 'sonnet', 'opus' ou 'haiku'. */
  model: string;
  dataDir: string;
  version: string;
}

export interface WorkspaceApi {
  suggestText(req: SuggestRequest): Promise<string>;
  rebuildStats(): Promise<ProjectData>;
  syncSubagents(names: string[]): Promise<ProjectData>;
  removeSubagent(name: string): Promise<ProjectData>;
  runBackgroundTask(id: string): Promise<ProjectData>;
  approveBackgroundTask(id: string): Promise<ProjectData>;
  onProjectChanged(listener: () => void): () => void;
  restoreWorkflowVersion(workflow: string, version: string): Promise<ProjectData>;
  snapshotWorkflow(workflow: string): Promise<ProjectData>;
  saveScript(name: string, content: string, create: boolean): Promise<ProjectData>;
  deleteScript(name: string): Promise<ProjectData>;
  loadSettings(): Promise<AppSettings>;
  setSettings(patch: { model?: string; ticketsFile?: '' }): Promise<AppSettings>;
  loadTickets(): Promise<TicketsData>;
  chooseTicketsFile(): Promise<TicketsData | null>;
  linkTicket(key: string, links: { parent: string; docs: string[] }): Promise<TicketsData>;
  saveTicket(key: string, edits: TicketEdits): Promise<TicketsData>;
  resetTicket(key: string): Promise<TicketsData>;
  createTicket(fields: TicketEdits & { summary: string }): Promise<TicketsData>;
  deleteTicket(key: string): Promise<TicketsData>;
  splitFeat(featId: string): Promise<SplitProposal>;
  proposeDocUpdate(docPath: string, instruction: string): Promise<{ body: string; linked: string[] }>;
  applySplit(featId: string, proposal: SplitProposal): Promise<ProjectData>;
  onTicketsChanged(listener: (data: TicketsData) => void): () => void;
  loadProject(): Promise<ProjectData>;
  chooseWorkspace(): Promise<ProjectData | null>;
  resolveInboxItem(path: string, result?: '' | 'approved' | 'rejected'): Promise<ProjectData>;
  importDriveDoc(url: string): Promise<ProjectData>;
  saveEntity(kind: string, path: string | null, fields: Record<string, unknown>, body?: string): Promise<ProjectData>;
  deleteEntity(kind: string, path: string): Promise<ProjectData>;
  workflowOp(workflow: string, op: WorkflowOp): Promise<ProjectData>;
  decideSession(path: string, result: '' | 'approved' | 'rejected', picks?: Record<string, boolean>): Promise<ProjectData>;
  saveInstruction(path: string, text: string): Promise<ProjectData>;
  patchFile(path: string, patch: Record<string, unknown>): Promise<ProjectData>;
  routePrompt(prompt: string): Promise<RouteResult>;
  startRun(prompt: string, followUp?: string, workflow?: string, route?: { confidence: number; text: string }): Promise<string>;
  answerAsk(runId: string, askId: string, allow: boolean): Promise<void>;
  stopRun(runId: string): Promise<void>;
  onRunEvent(listener: (event: RunEvent) => void): () => void;
}

export type WorkflowOp =
  | { op: 'insertAfter'; nodeId: string; type: 'agent' | 'script' | 'human' | 'alert' }
  | { op: 'remove'; nodeId: string }
  | { op: 'update'; nodeId: string; fields: Record<string, unknown> }
  | { op: 'edgeKind'; from: string; to: string; kind: 'ok' | 'fail' | 'blocked' }
  | { op: 'detach'; nodeId: string }
  /** Dépose une étape dans la grille : depuis la bibliothèque (libId) ou une étape vide (type). */
  | { op: 'add'; libId?: string; type?: 'agent' | 'script' | 'human' | 'alert'; c: number; l: number }
  | { op: 'move'; nodeId: string; c: number; l: number }
  | { op: 'link'; from: string; to: string; kind: 'ok' | 'fail' | 'blocked' }
  | { op: 'unlink'; from: string; to: string };
