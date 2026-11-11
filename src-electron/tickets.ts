import fs from 'node:fs';
import path from 'node:path';
import type { Ticket, TicketEdits, TicketsData } from '../src/shared/types';

const LEGACY_CSV = 'jira-tickets.csv';
const LEGACY_JSON = 'jira-tickets.json';
/** Dossier du projet qui reçoit les tickets : un fichier CSV par projet. */
const TICKETS_DIR = 'Tickets';
/** Colonnes du CSV, dans l'ordre : une ligne par ticket. Modifiable dans Google Sheets (ouvrir le CSV, modifier, Fichier > Enregistrer). */
const COLONNES = ['key', 'project', 'summary', 'description', 'type', 'status', 'statusCategory', 'priority', 'assignee', 'created', 'updated'] as const;

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s;
};

/** Anciens fichiers globaux (tous projets confondus) : servent à amorcer le fichier d'un projet. */
function legacyFiles(root: string): string[] {
  return [path.join(root, 'jira', LEGACY_JSON), path.join(root, 'jira', LEGACY_CSV)].filter((f) => fs.existsSync(f));
}

/** Nom de fichier du projet : le dossier du projet donne le nom (ex. Discovers -> Discovers.csv). */
const projectFile = (project: string) => project.replace(/[/\\:]/g, '-').trim() + '.csv';

/** Garantit Tickets/<projet>.csv dans le projet : s'il manque, le crée avec les lignes de ce projet prises dans un ancien fichier global, sinon la ligne d'en-têtes seule. */
function ensureProjectFile(root: string, project: string): string | null {
  const dir = path.join(root, TICKETS_DIR);
  const file = path.join(dir, projectFile(project));
  if (fs.existsSync(file)) return file;
  if (!fs.existsSync(dir)) {
    for (const legacy of legacyFiles(root)) {
      try {
        const mine = readSource(legacy).issues.filter((t) => String(t.project ?? '').trim().toLowerCase() === project.toLowerCase());
        if (!mine.length) continue;
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(file, [COLONNES.join(','), ...mine.map((t) => COLONNES.map((c) => csvCell(t[c as keyof Ticket])).join(','))].join('\r\n') + '\r\n');
        return file;
      } catch {
        /* fichier illisible : on essaie le suivant */
      }
    }
  }
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, COLONNES.join(',') + '\r\n');
    return file;
  } catch {
    return null;
  }
}

/** Fichier lu par l'app : choix manuel, sinon Tickets/<nom du projet>.csv à la racine du projet (créé s'il manque), sinon l'ancien fichier global. */
export function resolveTicketsFile(root: string, chosen?: string): { file: string; origin: 'choisi' | 'drive' | 'projet' } | null {
  if (chosen && fs.existsSync(chosen)) return { file: chosen, origin: 'choisi' };
  if (root) {
    const file = ensureProjectFile(root, path.basename(root));
    if (file) return { file, origin: 'projet' };
  }
  const legacy = legacyFiles(root)[0];
  return legacy ? { file: legacy, origin: 'projet' } : null;
}

/** Découpe un texte CSV (guillemets, virgules et retours à la ligne dans les cellules). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((v) => v.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v.trim() !== '')) rows.push(row);
  return rows;
}

/** Lit le fichier des tickets : CSV (une ligne par ticket) ou ancien export JSON Jira. */
function readSource(file: string): { exportedAt: string; issues: Ticket[] } {
  const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  if (!file.toLowerCase().endsWith('.csv')) {
    const raw = JSON.parse(text) as { exportedAt?: string; issues?: Ticket[] };
    return { exportedAt: raw.exportedAt ?? '', issues: Array.isArray(raw.issues) ? raw.issues : [] };
  }
  const rows = parseCsv(text);
  const header = (rows.shift() ?? []).map((h) => h.trim().toLowerCase());
  const issues: Ticket[] = [];
  for (const row of rows) {
    const get = (name: string) => {
      const i = header.indexOf(name.toLowerCase());
      return i >= 0 ? (row[i] ?? '').trim() : '';
    };
    const key = get('key');
    const summary = get('summary');
    if (!key || !summary) continue;
    issues.push({
      key,
      project: get('project') || key.split('-')[0],
      summary,
      description: get('description'),
      type: get('type') || null,
      status: get('status') || null,
      statusCategory: get('statuscategory') || null,
      priority: get('priority') || null,
      assignee: get('assignee') || null,
      created: get('created'),
      updated: get('updated')
    });
  }
  return { exportedAt: '', issues };
}

interface Entry { parent: string; docs: string[]; edits?: TicketEdits; local?: Ticket }
type Links = Record<string, Entry>;
const linksFile = (root: string) => path.join(root, 'links', 'tickets.json');
const FIELDS: (keyof TicketEdits)[] = ['summary', 'description', 'status', 'priority', 'assignee', 'type'];
const MAX: Record<keyof TicketEdits, number> = { summary: 300, description: 8000, status: 40, priority: 20, assignee: 80, type: 30 };
const DEFAULT_STATUSES = [{ name: 'À faire', category: 'To Do' }, { name: 'En cours', category: 'In Progress' }, { name: 'En revue', category: 'In Progress' }, { name: 'Terminé', category: 'Done' }];

function readLinks(root: string): Links {
  try {
    return JSON.parse(fs.readFileSync(linksFile(root), 'utf8')) as Links;
  } catch {
    return {};
  }
}
function writeLinks(root: string, all: Links) {
  for (const [k, v] of Object.entries(all)) {
    if (!v.local && !v.parent && !v.docs.length && !Object.keys(v.edits ?? {}).length) delete all[k];
  }
  fs.mkdirSync(path.dirname(linksFile(root)), { recursive: true });
  fs.writeFileSync(linksFile(root), JSON.stringify(all, null, 2));
}
const entry = (all: Links, key: string): Entry => (all[key] ??= { parent: '', docs: [] });
const checkKey = (key: string) => { if (!/^[A-Z]+-\d+$/.test(key)) throw new Error('Clé de ticket invalide.'); };

function cleanEdits(raw: TicketEdits): TicketEdits {
  const out: TicketEdits = {};
  for (const f of FIELDS) {
    if (raw[f] === undefined) continue;
    const v = String(raw[f] ?? '').trim();
    if (v.length > MAX[f]) throw new Error(`« ${f} » est trop long.`);
    out[f] = v;
  }
  return out;
}

/** Lie un ticket à un parent et à des documents. Stocké dans le projet : l'export Jira ne les écrase pas. */
export function setTicketLinks(root: string, key: string, links: { parent: string; docs: string[] }, chosen?: string): TicketsData {
  checkKey(key);
  const all = readLinks(root);
  const e = entry(all, key);
  e.parent = String(links.parent ?? '').trim().slice(0, 80);
  e.docs = (Array.isArray(links.docs) ? links.docs : []).map((d) => String(d).trim()).filter((d) => d && d.length < 200 && !d.includes('..')).slice(0, 40);
  writeLinks(root, all);
  return loadTickets(root, chosen);
}

/** Modifie des champs d'un ticket dans l'app. Une valeur identique à celle du fichier Drive annule la modification. */
export function saveTicket(root: string, key: string, edits: TicketEdits, chosen?: string): TicketsData {
  checkKey(key);
  const clean = cleanEdits(edits);
  const all = readLinks(root);
  const e = entry(all, key);
  if (e.local) {
    Object.assign(e.local, clean);
    if (!e.local.summary) throw new Error('Le titre est obligatoire.');
  } else {
    const source = sourceTickets(root, chosen).find((t) => t.key === key);
    if (!source) throw new Error('Ticket introuvable : ' + key);
    e.edits ??= {};
    for (const f of FIELDS) {
      if (clean[f] === undefined) continue;
      const original = f === 'description' ? '' : String(source[f] ?? '');
      if (clean[f] === original) delete e.edits[f];
      else e.edits[f] = clean[f];
    }
    if (e.edits.summary === '') throw new Error('Le titre est obligatoire.');
  }
  writeLinks(root, all);
  return loadTickets(root, chosen);
}

export function resetTicket(root: string, key: string, chosen?: string): TicketsData {
  checkKey(key);
  const all = readLinks(root);
  if (all[key] && !all[key].local) delete all[key].edits;
  writeLinks(root, all);
  return loadTickets(root, chosen);
}

/** Crée un ticket dans l'app (clé LOC-n). Il n'existe pas dans Jira. */
export function createTicket(root: string, fields: TicketEdits, chosen?: string): TicketsData {
  const clean = cleanEdits(fields);
  if (!clean.summary) throw new Error('Le titre est obligatoire.');
  const all = readLinks(root);
  const n = Math.max(0, ...Object.keys(all).filter((k) => k.startsWith('LOC-')).map((k) => Number(k.slice(4)) || 0)) + 1;
  const key = 'LOC-' + n;
  const now = new Date().toISOString();
  all[key] = { parent: '', docs: [], local: { key, project: 'LOC', summary: clean.summary, description: clean.description ?? '', type: clean.type || 'Task', status: clean.status || 'À faire', statusCategory: null, priority: clean.priority || 'Medium', assignee: clean.assignee || null, created: now, updated: now } };
  writeLinks(root, all);
  return loadTickets(root, chosen);
}

export function deleteLocalTicket(root: string, key: string, chosen?: string): TicketsData {
  checkKey(key);
  const all = readLinks(root);
  if (!all[key]?.local) throw new Error('Seuls les tickets créés dans l\'app se suppriment.');
  delete all[key];
  writeLinks(root, all);
  return loadTickets(root, chosen);
}

function sourceTickets(root: string, chosen?: string): Ticket[] {
  const found = resolveTicketsFile(root, chosen);
  if (!found) return [];
  return readSource(found.file).issues;
}

export function loadTickets(root: string, chosen?: string): TicketsData {
  const found = resolveTicketsFile(root, chosen);
  const blank = { statuses: DEFAULT_STATUSES, priorities: ['Highest', 'High', 'Medium', 'Low', 'Lowest'], types: ['Task', 'Bug', 'Story'] };
  if (!found) {
    return { file: '', origin: 'aucun', exportedAt: '', readAt: new Date().toISOString(), tickets: [], ...blank, error: `Aucun fichier Tickets/<nom du projet>.csv trouvé (et dossier du projet inaccessible en écriture).` };
  }
  try {
    const { exportedAt, issues: source } = readSource(found.file);
    const links = readLinks(root);
    const cats = new Map<string, string>(DEFAULT_STATUSES.map((x) => [x.name, x.category]));
    for (const t of source) if (t.status && t.statusCategory) cats.set(t.status, t.statusCategory);
    const apply = (t: Ticket, e: Entry | undefined): Ticket => {
      const edits = e?.edits ?? {};
      const merged: Ticket = { ...t, ...Object.fromEntries(Object.entries(edits).filter(([k]) => k !== 'description')), parent: e?.parent ?? '', docs: e?.docs ?? [], description: edits.description ?? t.description ?? '' };
      merged.local = Object.keys(edits);
      if (edits.status) merged.statusCategory = cats.get(edits.status) ?? 'To Do';
      return merged;
    };
    const tickets = source.map((t) => apply(t, links[t.key]));
    for (const [key, e] of Object.entries(links)) {
      if (!e.local) continue;
      const t = apply(e.local, e);
      t.key = key; t.isLocal = true; t.local = [];
      t.statusCategory = cats.get(t.status ?? '') ?? 'To Do';
      tickets.push(t);
    }
    const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))];
    return {
      file: found.file, origin: found.origin, exportedAt, readAt: new Date().toISOString(), tickets,
      statuses: [...cats].map(([name, category]) => ({ name, category })),
      priorities: uniq([...blank.priorities, ...source.map((t) => t.priority)]),
      types: uniq([...blank.types, ...source.map((t) => t.type)]),
      error: ''
    };
  } catch (e) {
    return { file: found.file, origin: found.origin, exportedAt: '', readAt: new Date().toISOString(), tickets: [], ...blank, error: `Lecture impossible : ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Surveille le fichier (Drive le réécrit à chaque synchro). Renvoie une fonction d'arrêt. */
export function watchTickets(file: string, onChange: () => void): () => void {
  let timer: NodeJS.Timeout | undefined;
  const fire = () => {
    clearTimeout(timer);
    timer = setTimeout(onChange, 400);
  };
  try {
    fs.watchFile(file, { interval: 2000 }, (cur, prev) => {
      if (cur.mtimeMs !== prev.mtimeMs) fire();
    });
  } catch {
    return () => undefined;
  }
  return () => {
    clearTimeout(timer);
    fs.unwatchFile(file);
  };
}
