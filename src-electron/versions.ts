import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { fmtDuration, fmtK, parseDuration, parseTokens } from './units';

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;
const MAX_VERSIONS = 40;

export interface VersionEntry {
  name: string; tag: string; change: string; meta: string;
  /** Contenu exact de workflows/<id>.md à cette version : permet le retour arrière. */
  snapshot?: string; hash?: string; createdAt?: string; by?: string;
  stats?: unknown;
}

const wfFile = (root: string, id: string) => {
  if (!ID.test(id)) throw new Error('Workflow inconnu : ' + id);
  return path.join(root, 'workflows', id + '.md');
};
const versionsFile = (root: string, id: string) => path.join(root, 'versions', id + '.md');
export const hashOf = (raw: string) => crypto.createHash('sha1').update(raw).digest('hex').slice(0, 16);

export function readVersions(root: string, id: string): { entries: VersionEntry[]; body: string } {
  const f = versionsFile(root, id);
  if (!fs.existsSync(f)) return { entries: [], body: '' };
  const parsed = matter(fs.readFileSync(f, 'utf8'));
  const entries = (Array.isArray(parsed.data.versions) ? parsed.data.versions : []).filter((v): v is VersionEntry => !!v && typeof v === 'object');
  return { entries, body: parsed.content.trim() };
}

function writeVersions(root: string, id: string, entries: VersionEntry[], body: string) {
  fs.mkdirSync(path.join(root, 'versions'), { recursive: true });
  fs.writeFileSync(versionsFile(root, id), matter.stringify((body || "Versions enregistrées par l'application à chaque lancement dont le workflow a changé.") + '\n', { versions: entries.slice(0, MAX_VERSIONS) }));
}

type RawNode = Record<string, unknown>;
const nodesOf = (raw: string): RawNode[] => {
  const n = matter(raw).data.nodes;
  return Array.isArray(n) ? n.filter((x): x is RawNode => !!x && typeof x === 'object') : [];
};
const edgesOf = (raw: string): string => JSON.stringify(matter(raw).data.edges ?? []);
const labelOf = (n: RawNode) => String(n.label ?? n.libId ?? n.id ?? '?');
const withoutPlace = (n: RawNode) => JSON.stringify({ ...n, c: undefined, l: undefined });

/** Résume en une phrase ce qui a changé entre deux contenus de workflow. */
export function describeChange(prevRaw: string | undefined, nextRaw: string): string {
  if (!prevRaw) return "Version enregistrée par l'application";
  try { return compare(prevRaw, nextRaw); } catch { return 'Workflow modifié'; }
}

function compare(prevRaw: string, nextRaw: string): string {
  const prev = new Map(nodesOf(prevRaw).map((n) => [String(n.id), n]));
  const next = new Map(nodesOf(nextRaw).map((n) => [String(n.id), n]));
  const added = [...next].filter(([id]) => !prev.has(id)).map(([, n]) => labelOf(n));
  const removed = [...prev].filter(([id]) => !next.has(id)).map(([, n]) => labelOf(n));
  const changed = [...next].filter(([id, n]) => prev.has(id) && withoutPlace(prev.get(id) as RawNode) !== withoutPlace(n)).map(([, n]) => labelOf(n));
  const moved = [...next].some(([id, n]) => prev.has(id) && withoutPlace(prev.get(id) as RawNode) === withoutPlace(n) && JSON.stringify([prev.get(id)?.c, prev.get(id)?.l]) !== JSON.stringify([n.c, n.l]));
  const parts = [
    added.length ? 'Ajout de ' + added.join(', ') : '',
    removed.length ? 'Retrait de ' + removed.join(', ') : '',
    changed.length ? 'Modification de ' + changed.join(', ') : '',
    edgesOf(prevRaw) !== edgesOf(nextRaw) ? 'Liens modifiés' : '',
    moved ? 'Étapes déplacées' : '',
    matter(prevRaw).data.name !== matter(nextRaw).data.name || matter(prevRaw).data.when !== matter(nextRaw).data.when ? 'Nom ou usage modifié' : ''
  ].filter(Boolean);
  return (parts.join('. ') || 'Modifications mineures').slice(0, 200);
}

function push(root: string, id: string, raw: string, change: string, by: string): VersionEntry {
  const { entries, body } = readVersions(root, id);
  const n = Math.max(0, ...entries.map((e) => Number(/^v(\d+)$/.exec(e.name)?.[1] ?? 0))) + 1;
  const prev = entries.map((e) => (e.tag === 'Actuelle' ? { ...e, tag: 'Précédente' } : e.tag === 'Précédente' ? { ...e, tag: '' } : e));
  const entry: VersionEntry = { name: 'v' + n, tag: 'Actuelle', change, meta: '', snapshot: raw, hash: hashOf(raw), createdAt: new Date().toISOString(), by };
  writeVersions(root, id, [entry, ...prev], body);
  return entry;
}

/** Enregistre une version si le workflow a changé depuis la dernière. Renvoie la version en vigueur. */
export function recordVersion(root: string, id: string, by = 'par toi'): { name: string; created: boolean } {
  const file = wfFile(root, id);
  if (!fs.existsSync(file)) throw new Error('Workflow introuvable : ' + id);
  const raw = fs.readFileSync(file, 'utf8');
  const { entries } = readVersions(root, id);
  const latest = entries[0];
  if (latest?.hash && latest.hash === hashOf(raw)) return { name: latest.name, created: false };
  const entry = push(root, id, raw, describeChange(latest?.snapshot, raw), by);
  return { name: entry.name, created: true };
}

/** Remet le workflow dans l'état d'une ancienne version. L'historique est gardé : le retour devient une nouvelle version. */
export function restoreVersion(root: string, id: string, name: string): string {
  const file = wfFile(root, id);
  const target = readVersions(root, id).entries.find((e) => e.name === name);
  if (!target?.snapshot) throw new Error("Cette version n'a pas de copie du workflow : le retour arrière est impossible.");
  fs.writeFileSync(file, target.snapshot);
  return push(root, id, target.snapshot, 'Retour à ' + name, 'par toi').name;
}

function relative(iso: string): string {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (!Number.isFinite(days) || days <= 0) return "Aujourd'hui";
  if (days === 1) return 'Hier';
  if (days < 14) return `Il y a ${days} jours`;
  return `Il y a ${Math.round(days / 7)} semaines`;
}
export const metaOf = (v: { createdAt?: unknown; by?: unknown; meta?: unknown }): string =>
  typeof v.createdAt === 'string' && v.createdAt ? `${relative(v.createdAt)} · ${String(v.by || 'par toi')}` : String(v.meta ?? '');

interface SessionLite { workflow: string; workflowVersion: string; tokens: string; elapsed: string; nodes: { state: string; meta: string }[] }

/** Chiffres d'une version, calculés sur les sessions qui l'ont utilisée. */
export function versionStats(sessions: SessionLite[], workflowName: string, version: string): { label: string; value: string; hint: string }[] {
  const mine = sessions.filter((s) => s.workflow === workflowName && s.workflowVersion === version);
  if (!mine.length) return [];
  const tokens = mine.reduce((a, s) => a + parseTokens(s.tokens), 0) / mine.length;
  const ms = mine.reduce((a, s) => a + parseDuration(s.elapsed), 0) / mine.length;
  const wait = mine.reduce((a, s) => a + s.nodes.filter((n) => /^attente/i.test(n.meta)).reduce((x, n) => x + parseDuration(n.meta), 0), 0) / mine.length;
  const alerted = mine.filter((s) => s.nodes.some((n) => n.state === 'alert')).length;
  return [
    { label: 'Coût moyen', value: fmtK(tokens), hint: 'tokens par session' },
    { label: 'Durée moyenne', value: fmtDuration(ms), hint: wait ? `dont ${fmtDuration(wait)} d'attente de toi` : "sans attente de ta part" },
    { label: 'Alertes', value: Math.round((alerted / mine.length) * 100) + ' %', hint: 'des sessions' },
    { label: 'Sessions', value: String(mine.length), hint: 'sur cette version' }
  ];
}
