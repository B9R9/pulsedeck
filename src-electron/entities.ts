import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { DOC_DIRS, ENTITIES, NODE_FIELDS } from '../src/shared/entities';
import type { EntityKind, FieldDef } from '../src/shared/entities';
import type { ProjectData } from '../src/shared/types';
import { loadProject } from './project-store';
import { refreshStats } from './stats';
import { askClaude } from './claude-runner';
import { loadTickets } from './tickets';
import type { SplitProposal } from '../src/shared/types';

type Fields = Record<string, unknown>;
const fail = (message: string): never => { throw new Error(message); };

/** Vérifie et convertit une valeur selon son champ. Renvoie undefined pour « effacer ». */
function coerce(def: FieldDef, value: unknown): unknown {
  if (value === null || value === undefined || value === '') {
    if (def.required) fail(`Le champ « ${def.label} » est obligatoire.`);
    return def.type === 'bool' ? false : undefined;
  }
  switch (def.type) {
    case 'string':
    case 'ref': {
      const v = String(value).trim();
      if (v.length > 400) fail(`« ${def.label} » est trop long.`);
      return v;
    }
    case 'text': {
      const v = String(value);
      if (v.length > 8000) fail(`« ${def.label} » est trop long.`);
      return v;
    }
    case 'number': {
      const n = Number(value);
      if (!Number.isFinite(n) || Math.abs(n) > 1e9) fail(`« ${def.label} » doit être un nombre.`);
      return n;
    }
    case 'bool':
      return value === true;
    case 'enum': {
      const v = String(value);
      if (!def.options?.some((o) => o.value === v)) fail(`Valeur refusée pour « ${def.label} ».`);
      return v;
    }
    case 'list': {
      const items = Array.isArray(value) ? value : String(value).split(',');
      const out = items.map((x) => String(x).trim()).filter(Boolean);
      if (out.length > 40 || out.some((x) => x.length > 120)) fail(`« ${def.label} » contient trop d'éléments.`);
      return out;
    }
  }
}

function slug(text: string, fallback: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || fallback;
}

/** Résout un chemin relatif et refuse tout ce qui sort du dossier de l'entité. */
function confine(root: string, dir: string, recursive: boolean, relPath: string): string {
  const base = path.resolve(root, dir);
  const full = path.resolve(root, relPath);
  const inside = full.startsWith(base + path.sep) && full.endsWith('.md');
  const flat = recursive || path.dirname(full) === base;
  if (!inside || !flat) fail('Chemin refusé : ' + relPath);
  return full;
}

function writeMd(file: string, data: Fields, body: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, matter.stringify(body.trim() ? body.trim() + '\n' : '', data));
}

function starterWorkflow(): Fields {
  return {
    nodes: [
      { id: 'work', type: 'agent', l: 1, label: 'Agent', model: 'Sonnet 5.5', effort: 'Moyen', tools: ['Lecture'], prompt: 'Décris ici ce que cet agent doit faire.', success: 'Il déclare avoir terminé et le résultat est vérifiable.', retries: 3, budget: '40k', cond: 'Toujours', isolated: false },
      { id: 'valid', type: 'human', l: 1, label: 'Ta validation' }
    ],
    edges: [['work', 'valid', 'ok']]
  };
}

export function saveEntity(root: string, kind: EntityKind, relPath: string | null, fields: Fields, body?: string): ProjectData {
  const def = ENTITIES[kind] ?? fail('Type inconnu : ' + kind);
  if (kind === 'session') fail('Les sessions ne se modifient pas à la main.');
  const creating = relPath === null;
  const known = new Map(def.fields.map((f) => [f.key, f]));
  for (const key of Object.keys(fields)) {
    if (!known.has(key)) fail('Champ refusé : ' + key);
    if (!creating && known.get(key)?.createOnly) fail('Le champ « ' + key + ' » ne peut plus changer.');
  }

  let file: string;
  let data: Fields;
  let text: string;
  if (creating) {
    for (const f of def.fields) if (f.required && (fields[f.key] === undefined || fields[f.key] === '')) fail(`Le champ « ${f.label} » est obligatoire.`);
    const id = def.idPattern ? String(fields.id ?? '') : slug(String(fields.title ?? ''), kind);
    if (def.idPattern && !def.idPattern.test(id)) fail('Identifiant invalide. ' + (def.idHint ?? ''));
    const dir = kind === 'doc' ? DOC_DIRS[String(fields.type)] ?? fail('Type de document inconnu.') : def.dir;
    file = path.resolve(root, dir, id + '.md');
    confine(root, def.dir, !!def.recursive, path.relative(root, file));
    if (fs.existsSync(file)) fail('Ce fichier existe déjà : ' + path.relative(root, file));
    data = kind === 'workflow' ? starterWorkflow() : {};
    text = body ?? '';
  } else {
    file = confine(root, def.dir, !!def.recursive, relPath);
    if (!fs.existsSync(file)) fail('Fichier introuvable : ' + relPath);
    const parsed = matter(fs.readFileSync(file, 'utf8'));
    data = parsed.data as Fields;
    text = body ?? parsed.content;
  }
  if (body !== undefined && !def.body) fail('Ce type n\'a pas de contenu libre.');

  for (const [key, raw] of Object.entries(fields)) {
    const v = coerce(known.get(key) as FieldDef, raw);
    if (v === undefined) delete data[key];
    else data[key] = v;
  }
  if (kind === 'doc' && creating && !data.updated) data.updated = new Date().toISOString().slice(0, 10);
  writeMd(file, data, text);
  return loadProject(root);
}

export function deleteEntity(root: string, kind: EntityKind, relPath: string): ProjectData {
  const def = ENTITIES[kind] ?? fail('Type inconnu : ' + kind);
  const file = confine(root, def.dir, !!def.recursive, relPath);
  if (!fs.existsSync(file)) fail('Fichier introuvable : ' + relPath);
  const rel = path.relative(root, file).split(path.sep).join('/');
  const stem = path.basename(file, '.md');
  const id = String(matter(fs.readFileSync(file, 'utf8')).data.id ?? stem);
  const d = loadProject(root);

  if (kind === 'cycle') {
    const n = d.feats.filter((f) => f.cycle === id).length;
    if (n) fail(`Ce cycle contient ${n} feat${n > 1 ? 's' : ''} : déplace-les ou supprime-les d'abord.`);
  } else if (kind === 'feat') {
    const n = d.pulses.filter((p) => p.feat === id).length;
    if (n) fail(`Cette feat contient ${n} pulse${n > 1 ? 's' : ''} : supprime-les d'abord.`);
  } else if (kind === 'session') {
    const n = d.pulses.filter((p) => p.session === id).map((p) => p.id);
    if (n.length) fail('Cette session est liée à ' + n.join(', ') + '.');
  } else if (kind === 'library') {
    const users = d.workflows.filter((w) => w.nodes.some((x) => x.libId === stem)).map((w) => w.name);
    if (users.length) fail('Ce nœud est utilisé dans : ' + users.join(', ') + '.');
  } else if (kind === 'doc') {
    const feats = d.feats.filter((f) => f.spec === rel).map((f) => f.id);
    const nodes = d.workflows.filter((w) => w.nodes.some((x) => x.docs.some((r) => r.path === rel))).map((w) => w.name);
    if (feats.length || nodes.length) fail('Ce document est lié à ' + [...feats, ...nodes].join(', ') + '.');
  }
  fs.unlinkSync(file);
  return loadProject(root);
}

/** Enregistre la décision prise sur une session (valider ou refuser) et l'état des briques du plan. */
export function decideSession(root: string, relPath: string, result: '' | 'approved' | 'rejected', picks?: Record<string, boolean>): ProjectData {
  if (!['', 'approved', 'rejected'].includes(result)) fail('Décision inconnue.');
  const file = confine(root, 'sessions', false, relPath);
  if (!fs.existsSync(file)) fail('Fichier introuvable : ' + relPath);
  const parsed = matter(fs.readFileSync(file, 'utf8'));
  const data = parsed.data as Fields;
  if (result) { data.decisionResult = result; data.decidedAt = new Date().toISOString(); }
  else { delete data.decisionResult; delete data.decidedAt; }
  if (picks && Array.isArray(data.choices)) {
    for (const c of data.choices as { picks?: { id?: string; off?: boolean }[] }[]) {
      for (const p of c.picks ?? []) if (p.id && p.id in picks) p.off = picks[p.id] === true;
    }
  }
  fs.writeFileSync(file, matter.stringify(parsed.content, data));
  refreshStats(root);
  return loadProject(root);
}

/** Traite un élément de inbox/. Retenir une proposition de mémoire crée l'entrée dans memory/. */
export function resolveInboxItem(root: string, relPath: string, result: '' | 'approved' | 'rejected' = ''): ProjectData {
  const file = confine(root, 'inbox', false, relPath);
  if (!fs.existsSync(file)) fail('Fichier introuvable : ' + relPath);
  if (!['', 'approved', 'rejected'].includes(result)) fail('Décision inconnue.');
  const parsed = matter(fs.readFileSync(file, 'utf8'));
  const data = parsed.data as Fields;
  data.done = true;
  if (result) data.result = result;
  if (data.kind === 'memo' && result === 'approved') {
    const title = String(data.title ?? 'Entrée de mémoire').replace(/^À retenir\s*:\s*/i, '');
    const target = path.resolve(root, 'memory', slug(title, 'memoire') + '.md');
    if (!fs.existsSync(target)) writeMd(target, { title }, String(data.detail ?? ''));
  }
  fs.writeFileSync(file, matter.stringify(parsed.content, data));
  return loadProject(root);
}

// ---- Étapes d'un workflow ----

import type { WorkflowOp } from '../src/shared/types';

type RawNode = Fields & { id: string; c?: number; l?: number; libId?: string };

/** Donne une colonne fixe aux étapes qui n'en ont pas encore (calculée d'après les liens), pour que la grille ne bouge pas. */
function freezeColumns(nodes: RawNode[], edges: RawEdge[]) {
  const parents = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const [a, b] of edges) parents.get(b)?.push(a);
  const memo = new Map<string, number>();
  const depth = (id: string, seen: string[] = []): number => {
    const k = memo.get(id);
    if (k !== undefined) return k;
    if (seen.includes(id)) return 0;
    const ps = parents.get(id) ?? [];
    const d = ps.length ? Math.max(...ps.map((p) => depth(p, [...seen, id]))) + 1 : 0;
    memo.set(id, d);
    return d;
  };
  for (const n of nodes) if (typeof n.c !== 'number') n.c = depth(n.id);
}

function cell(c: unknown, l: unknown): { c: number; l: number } {
  const cc = Math.round(Number(c));
  const ll = Math.round(Number(l) * 2) / 2;
  if (!Number.isFinite(cc) || !Number.isFinite(ll) || cc < 0 || cc > 60 || ll < 0 || ll > 40) fail('Position hors de la grille.');
  return { c: cc, l: ll };
}

function occupied(nodes: RawNode[], pos: { c: number; l: number }, except = '') {
  return nodes.some((n) => n.id !== except && n.c === pos.c && Math.abs((n.l ?? 0) - pos.l) < 1);
}
type RawEdge = [string, string, string];

const PROTO: Record<string, Fields> = {
  agent: { type: 'agent', label: 'Nouvel agent', model: 'Sonnet 5.5', effort: 'Moyen', tools: ['Lecture'], prompt: 'Décris ici ce que cet agent doit faire.', success: 'Il déclare avoir terminé et le résultat est vérifiable.', retries: 3, budget: '40k', cond: 'Toujours', isolated: false },
  script: { type: 'script', label: 'Nouveau script', command: 'npm run build', success: 'Code de sortie 0.', retries: 1, cond: 'Toujours' },
  human: { type: 'human', label: 'Ta validation' },
  alert: { type: 'alert', label: 'Alerte pour toi' }
};

export function workflowOp(root: string, wfId: string, op: WorkflowOp): ProjectData {
  if (!ENTITIES.workflow.idPattern?.test(wfId)) fail('Workflow inconnu.');
  const file = confine(root, 'workflows', false, 'workflows/' + wfId + '.md');
  if (!fs.existsSync(file)) fail('Workflow introuvable : ' + wfId);
  const parsed = matter(fs.readFileSync(file, 'utf8'));
  const data = parsed.data as Fields;
  const nodes = (Array.isArray(data.nodes) ? data.nodes : []) as RawNode[];
  let edges = (Array.isArray(data.edges) ? data.edges : []) as RawEdge[];
  const find = (id: string) => nodes.find((n) => n.id === id) ?? fail('Étape introuvable : ' + id);

  if (op.op === 'insertAfter') {
    const s = find(op.nodeId);
    const proto = PROTO[op.type] ?? fail('Type d\'étape inconnu.');
    let n = 1;
    while (nodes.some((x) => x.id === 'n' + n)) n++;
    freezeColumns(nodes, edges);
    let pos = { c: (s.c ?? 0) + 1, l: s.l ?? 1 };
    while (occupied(nodes, pos)) pos = { c: pos.c, l: pos.l + 1 };
    const node: RawNode = { id: 'n' + n, ...pos, ...proto } as RawNode;
    nodes.push(node);
    if (op.type === 'alert') {
      edges.push([s.id, node.id, 'fail']);
    } else {
      const moved = edges.filter((e) => e[0] === s.id && e[2] === 'ok').map((e) => [node.id, e[1], 'ok'] as RawEdge);
      edges = edges.filter((e) => !(e[0] === s.id && e[2] === 'ok')).concat([[s.id, node.id, 'ok']], moved);
    }
  } else if (op.op === 'remove') {
    if (nodes.length <= 2) fail('Un workflow garde au moins deux étapes.');
    find(op.nodeId);
    const ins = edges.filter((e) => e[1] === op.nodeId && e[2] === 'ok').map((e) => e[0]);
    const outs = edges.filter((e) => e[0] === op.nodeId && e[2] === 'ok').map((e) => e[1]);
    edges = edges.filter((e) => e[0] !== op.nodeId && e[1] !== op.nodeId);
    for (const p of ins) for (const c of outs) if (!edges.some((e) => e[0] === p && e[1] === c)) edges.push([p, c, 'ok']);
    nodes.splice(nodes.findIndex((x) => x.id === op.nodeId), 1);
  } else if (op.op === 'update') {
    const node = find(op.nodeId);
    const known = new Map(NODE_FIELDS.map((f) => [f.key, f]));
    const clean: Fields = {};
    for (const [k, v] of Object.entries(op.fields)) {
      const def = known.get(k) ?? fail('Champ refusé : ' + k);
      const value = coerce(def as FieldDef, v);
      if (value !== undefined) clean[k] = value;
      else clean[k] = null;
    }
    // Un nœud lié à la bibliothèque la modifie : tous les workflows qui l'utilisent suivent.
    const target: Fields = node.libId ? readLibrary(root, String(node.libId)) : node;
    for (const [k, v] of Object.entries(clean)) { if (v === null) delete target[k]; else target[k] = v; }
    if (node.libId) {
      for (const k of Object.keys(clean)) delete node[k]; // la valeur vient de la bibliothèque
      writeLibrary(root, String(node.libId), target);
    }
  } else if (op.op === 'edgeKind') {
    if (!['ok', 'fail', 'blocked'].includes(op.kind)) fail('Type de lien inconnu.');
    const e = edges.find((x) => x[0] === op.from && x[1] === op.to) ?? fail('Lien introuvable.');
    e[2] = op.kind;
  } else if (op.op === 'add') {
    freezeColumns(nodes, edges);
    const pos = cell(op.c, op.l);
    if (occupied(nodes, pos)) fail('Cette case est déjà prise.');
    let n = 1;
    while (nodes.some((x) => x.id === 'n' + n)) n++;
    let node: RawNode;
    if (op.libId) {
      if (!fs.existsSync(libFile(root, op.libId))) fail('Nœud de bibliothèque introuvable.');
      const base = op.libId.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'n';
      let id = base;
      for (let i = 2; nodes.some((x) => x.id === id); i++) id = base + i;
      node = { id, ...pos, libId: op.libId };
    } else {
      const proto = PROTO[op.type ?? ''] ?? fail('Type d\'étape inconnu.');
      node = { id: 'n' + n, ...pos, ...proto } as RawNode;
    }
    nodes.push(node);
  } else if (op.op === 'move') {
    freezeColumns(nodes, edges);
    const node = find(op.nodeId);
    const pos = cell(op.c, op.l);
    if (occupied(nodes, pos, node.id)) fail('Cette case est déjà prise.');
    node.c = pos.c;
    node.l = pos.l;
  } else if (op.op === 'link') {
    if (!['ok', 'fail', 'blocked'].includes(op.kind)) fail('Type de lien inconnu.');
    find(op.from); find(op.to);
    if (op.from === op.to) fail('Une étape ne peut pas se relier à elle-même.');
    const e = edges.find((x) => x[0] === op.from && x[1] === op.to);
    if (e) e[2] = op.kind; else edges.push([op.from, op.to, op.kind]);
  } else if (op.op === 'unlink') {
    const before = edges.length;
    edges = edges.filter((x) => !(x[0] === op.from && x[1] === op.to));
    if (edges.length === before) fail('Lien introuvable.');
  } else if (op.op === 'detach') {
    const node = find(op.nodeId);
    if (!node.libId) fail('Cette étape n\'est pas liée à la bibliothèque.');
    Object.assign(node, { ...readLibrary(root, String(node.libId)), ...node });
    delete node.libId;
  }
  data.nodes = nodes;
  data.edges = edges;
  fs.writeFileSync(file, matter.stringify(parsed.content, data));
  return loadProject(root);
}

function libFile(root: string, id: string): string {
  if (!ENTITIES.library.idPattern?.test(id)) fail('Nœud de bibliothèque invalide.');
  return path.resolve(root, 'library', id + '.md');
}
function readLibrary(root: string, id: string): Fields {
  const f = libFile(root, id);
  return fs.existsSync(f) ? (matter(fs.readFileSync(f, 'utf8')).data as Fields) : {};
}
function writeLibrary(root: string, id: string, data: Fields) {
  writeMd(libFile(root, id), data, '');
}

/** Transforme un Google Doc partagé par lien en demande dans inbox/. Le document doit être lisible par « toute personne disposant du lien ». */
export async function importDriveDoc(root: string, url: string): Promise<ProjectData> {
  const m = /^https:\/\/docs\.google\.com\/document\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]{20,})/.exec(url.trim());
  if (!m) fail('Ce lien n\'est pas un Google Doc.');
  const res = await fetch(`https://docs.google.com/document/d/${m![1]}/export?format=txt`, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok || !type.includes('text/plain')) fail('Document illisible : il doit être partagé avec « toute personne disposant du lien ».');
  const text = (await res.text()).replace(/^\uFEFF/, '').trim();
  if (!text) fail('Le document est vide.');
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const title = lines[0].slice(0, 120);
  const detail = (lines.slice(1).join('\n') || lines[0]).slice(0, 1500) + '\n\nSource : ' + url.trim();
  const dir = path.resolve(root, 'inbox');
  const day = new Date().toISOString().slice(0, 10);
  let id = day + '-ticket-' + slug(title, 'ticket').slice(0, 24);
  for (let i = 2; fs.existsSync(path.join(dir, id + '.md')); i++) id = `${id.replace(/-\d+$/, '')}-${i}`;
  writeMd(path.join(dir, id + '.md'), {
    id, kind: 'valid', project: path.basename(root), title, when: "à l'instant", detail,
    primary: 'Voir le projet', target: 'projet', secondary: 'Marquer comme traité', done: false
  }, '');
  return loadProject(root);
}


function nextId(root: string, prefix: string): string {
  const d = loadProject(root);
  const ids = [...d.cycles, ...d.feats, ...d.pulses].map((x) => x.id).filter((id) => id.startsWith(prefix));
  return prefix + (Math.max(0, ...ids.map((id) => Number(id.slice(prefix.length)) || 0)) + 1);
}

/** Demande à Claude de découper une feat en pulses (et en cycle si elle n'en a pas). Ne crée rien. */
export async function splitFeat(root: string, featId: string, model?: string): Promise<SplitProposal> {
  const d = loadProject(root);
  const feat = d.feats.find((f) => f.id === featId) ?? fail('Feat introuvable : ' + featId);
  const spec = d.docs.find((x) => x.path === feat.spec);
  const workflows = d.workflows.map((w) => w.name).join(', ');
  const prompt = [
    'Tu découpes une feat en petites unités de travail (pulses). Un pulse tient dans une seule session et finit par un workflow.',
    `Feat : ${feat.title}`,
    `Résultat attendu : ${feat.goal || '(non précisé)'}`,
    spec ? `Spec :\n${spec.body.slice(0, 4000)}` : '',
    `Workflows disponibles : ${workflows}`,
    feat.cycle ? '' : 'La feat n\'a pas de cycle : propose-en un, avec une période.',
    'Réponds uniquement avec du JSON, sans texte autour :',
    '{"cycle": {"title": "...", "period": "..."} ou null, "pulses": [{"title": "...", "workflow": "<un workflow de la liste>"}]}',
    'Entre 2 et 8 pulses, titres courts et concrets, dans l\'ordre où on les fait.'
  ].filter(Boolean).join('\n\n');
  const text = await askClaude(prompt, root, model);
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) fail('Claude n\'a pas renvoyé de découpage lisible.');
  let raw: { cycle?: { title?: unknown; period?: unknown } | null; pulses?: { title?: unknown; workflow?: unknown }[] };
  try { raw = JSON.parse((m as RegExpMatchArray)[0]); } catch { return fail('Le découpage de Claude est illisible.'); }
  const names = d.workflows.map((w) => w.name);
  const pulses = (Array.isArray(raw.pulses) ? raw.pulses : []).slice(0, 12)
    .map((p) => ({ title: String(p.title ?? '').trim().slice(0, 120), workflow: names.includes(String(p.workflow)) ? String(p.workflow) : names[0] ?? '' }))
    .filter((p) => p.title);
  if (!pulses.length) fail('Claude n\'a proposé aucun pulse.');
  const cycle = !feat.cycle && raw.cycle && String(raw.cycle.title ?? '').trim()
    ? { title: String(raw.cycle.title).trim().slice(0, 120), period: String(raw.cycle.period ?? '').trim().slice(0, 80) }
    : null;
  return { cycle, pulses };
}

/** Crée ce que l'utilisateur a validé : le cycle (rattaché à la feat) et les pulses, tous avec leur lien de parent. */
export function applySplit(root: string, featId: string, proposal: SplitProposal): ProjectData {
  const d = loadProject(root);
  const feat = d.feats.find((f) => f.id === featId) ?? fail('Feat introuvable : ' + featId);
  if (!Array.isArray(proposal?.pulses) || !proposal.pulses.length || proposal.pulses.length > 12) fail('Découpage invalide.');
  if (proposal.cycle && !feat.cycle) {
    const id = nextId(root, 'C-');
    saveEntity(root, 'cycle', null, { id, title: proposal.cycle.title, period: proposal.cycle.period, state: 'À venir' });
    saveEntity(root, 'feat', feat.file, { cycle: id, parent: feat.parent || id });
  }
  for (const p of proposal.pulses) {
    const id = nextId(root, 'P-');
    saveEntity(root, 'pulse', null, { id, title: p.title, feat: featId, parent: featId, workflow: p.workflow, state: 'todo' });
  }
  return loadProject(root);
}


/** Demande à Claude une nouvelle version d'un document, d'après ses tickets liés et la consigne. Ne modifie rien. */
export async function proposeDocUpdate(root: string, docPath: string, instruction: string, ticketsFile?: string, model?: string): Promise<{ body: string; linked: string[] }> {
  const d = loadProject(root);
  const doc = d.docs.find((x) => x.path === docPath) ?? fail('Document introuvable : ' + docPath);
  const jira = loadTickets(root, ticketsFile).tickets.filter((t) => (t.docs ?? []).includes(docPath));
  const own = [...d.cycles, ...d.feats, ...d.pulses].filter((t) => t.docs.includes(docPath));
  const linked = [...own.map((t) => t.id), ...jira.map((t) => t.key)];
  const lines = [
    ...own.map((t) => `- ${t.id} : ${t.title}`),
    ...jira.map((t) => `- ${t.key} (${t.status ?? '?'}) : ${t.summary}${t.description ? ' | ' + t.description.slice(0, 600) : ''}`)
  ].slice(0, 60);
  const ask = instruction.trim().slice(0, 2000) || 'Mets le document à jour d\'après les tickets liés.';
  const prompt = [
    'Tu mets à jour un document markdown du projet. Garde son ton, sa structure et ce qui reste vrai. Ne change que ce que la consigne ou les tickets justifient. N\'invente rien.',
    `Document : ${doc.title} (${doc.path})`,
    `Consigne : ${ask}`,
    lines.length ? `Tickets liés :\n${lines.join('\n')}` : 'Aucun ticket lié.',
    `Contenu actuel :\n<<<\n${doc.body.slice(0, 40000)}\n>>>`,
    'Réponds uniquement avec le markdown complet de la nouvelle version, sans commentaire ni bloc de code autour.'
  ].join('\n\n');
  let out = (await askClaude(prompt, root, model)).trim();
  const fenced = out.match(/^```(?:markdown|md)?\n([\s\S]*)\n```$/);
  if (fenced) out = fenced[1];
  if (!out) fail('Claude n\'a rien proposé.');
  if (out.length > 60000) fail('La proposition est trop longue.');
  return { body: out, linked };
}
