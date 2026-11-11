import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import type { CostNode, StatsData } from '../src/shared/types';
import { loadProject } from './project-store';
import { fmtDuration, fmtK, num, parseDuration, parseTokens } from './units';

const DAY = 86_400_000;
const WINDOW_DAYS = 7;

export interface StatNode { id: string; c: number; l: number; label: string; sub: string; meta: string; tokens: number; ms: number; retries: number; human: boolean }
export interface StatSession {
  id: string; name: string; startedAt: number; pulse: string; workflow: string;
  tokens: number; ms: number; decision: '' | 'approved' | 'rejected';
  nodes: StatNode[]; edges: [string, string][]; bricks: { kind: string; label: string }[];
}
export interface StatInput {
  sessions: StatSession[];
  feats: { id: string; budget: number; cycle: string }[];
  pulses: { id: string; feat: string; state: string; session: string }[];
  cycles: { id: string; title: string; state: string }[];
  /** Skills connus (bibliothèque) : ceux jamais choisis apparaissent à zéro. */
  skills: string[];
  now: number;
}

export { fmtDuration, fmtK, parseDuration, parseTokens };

/** Lit un nœud de session. Le coût et la durée viennent de « meta », par exemple « 18k · 3 min · 2 essais ». */
function readNode(n: Record<string, unknown>): StatNode {
  const meta = String(n.meta ?? '');
  const label = String(n.label ?? '');
  const human = /^attente/i.test(meta) || /validation/i.test(label);
  const tokenPart = /(\d+(?:[.,]\d+)?\s*[kKmM])\b/.exec(meta);
  const tries = /(\d+)\s*essais?/.exec(meta);
  const relances = /(\d+)\s*relances?/.exec(meta);
  return {
    id: String(n.id ?? ''), c: num(n.c), l: num(n.l), label, sub: String(n.sub ?? ''), meta,
    tokens: tokenPart ? parseTokens(tokenPart[1]) : 0,
    ms: parseDuration(meta.replace(/\d+\s*(?:essais?|relances?)/g, '').replace(/\d+(?:[.,]\d+)?\s*[kKmM]\b/g, '')),
    retries: relances ? num(relances[1]) : tries ? Math.max(0, num(tries[1]) - 1) : 0,
    human
  };
}

export function readSessions(root: string): StatSession[] {
  const dir = path.join(root, 'sessions');
  if (!fs.existsSync(dir)) return [];
  const out: StatSession[] = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md'))) {
    const full = path.join(dir, f);
    try {
      const d = matter(fs.readFileSync(full, 'utf8')).data as Record<string, unknown>;
      const nodes = (Array.isArray(d.nodes) ? d.nodes : []).filter((n): n is Record<string, unknown> => !!n && typeof n === 'object').map(readNode);
      const started = Date.parse(String(d.startedAt ?? '')) || fs.statSync(full).mtimeMs;
      out.push({
        id: String(d.id ?? path.basename(f, '.md')), name: String(d.name ?? ''), startedAt: started, pulse: String(d.pulse ?? ''), workflow: String(d.workflow ?? ''),
        tokens: d.tokenCount !== undefined ? num(d.tokenCount) : parseTokens(d.tokens),
        ms: d.durationMs !== undefined ? num(d.durationMs) : parseDuration(d.elapsed),
        decision: d.decisionResult === 'approved' || d.decisionResult === 'rejected' ? d.decisionResult : '',
        nodes,
        edges: (Array.isArray(d.edges) ? d.edges : []).filter((e): e is unknown[] => Array.isArray(e) && e.length >= 2).map((e) => [String(e[0]), String(e[1])] as [string, string]),
        bricks: (Array.isArray(d.bricks) ? d.bricks : []).filter((b): b is Record<string, unknown> => !!b && typeof b === 'object').map((b) => ({ kind: String(b.kind ?? ''), label: String(b.label ?? '') })).filter((b) => b.label)
      });
    } catch { /* un récap illisible ne bloque pas les stats */ }
  }
  return out.sort((a, b) => a.startedAt - b.startedAt);
}

/** Début de chaque nœud : fin du plus tardif de ses prédécesseurs. */
function timeline(nodes: StatNode[], edges: [string, string][]): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const preds = (id: string) => edges.filter((e) => e[1] === id).map((e) => e[0]).filter((p) => byId.has(p));
  const visit = (id: string, seen: Set<string>): [number, number] => {
    const known = out.get(id);
    if (known) return known;
    if (seen.has(id)) return [0, 0];
    seen.add(id);
    const start = Math.max(0, ...preds(id).map((p) => visit(p, seen)[1]));
    const r: [number, number] = [start, start + (byId.get(id)?.ms ?? 0)];
    out.set(id, r);
    return r;
  };
  for (const n of nodes) visit(n.id, new Set());
  return out;
}

export function computeStats(input: StatInput): StatsData {
  const since = input.now - WINDOW_DAYS * DAY;
  const win = input.sessions.filter((s) => s.startedAt >= since);
  const totalTokens = win.reduce((a, s) => a + s.tokens, 0);
  const totalMs = win.reduce((a, s) => a + s.ms, 0);
  const waitMs = win.reduce((a, s) => a + s.nodes.filter((n) => n.human).reduce((x, n) => x + n.ms, 0), 0);
  const names = new Set(win.map((s) => s.name).filter(Boolean));
  const decided = win.filter((s) => s.decision);
  const approved = decided.filter((s) => s.decision === 'approved').length;

  // Session détaillée : la plus récente qui a des coûts par étape.
  const detailed = [...win].reverse().find((s) => s.nodes.some((n) => n.tokens > 0)) ?? [...win].reverse().find((s) => s.nodes.length) ?? null;
  const dn = detailed?.nodes ?? [];
  const dTokens = dn.reduce((a, n) => a + n.tokens, 0);
  const top = [...dn].sort((a, b) => b.tokens - a.tokens)[0];
  const costNodes: CostNode[] = dn.map((n) => {
    const share = dTokens ? n.tokens / dTokens : 0;
    const heat: CostNode['heat'] = n.human ? 'human' : n.tokens > 0 ? (share >= 0.4 ? 'hi' : share >= 0.15 ? 'mid' : 'lo') : n.ms > 0 ? 'script' : 'lo';
    return { id: n.id, c: n.c, l: n.l, label: n.label, cost: n.tokens ? fmtK(n.tokens) : '0 token', meta: n.ms ? fmtDuration(n.ms) + (n.retries ? ` · ${n.retries} relances` : '') : n.meta, heat };
  });
  const times = timeline(dn, detailed?.edges ?? []);
  const gantt = dn.filter((n) => n.ms > 0).map((n) => ({
    label: n.label, start: Math.round(((times.get(n.id)?.[0] ?? 0) / 60000) * 10) / 10, end: Math.round(((times.get(n.id)?.[1] ?? 0) / 60000) * 10) / 10,
    kind: (n.human ? 'human' : n.tokens === 0 ? 'script' : 'agent') as 'agent' | 'script' | 'human'
  }));

  // Dépenses par feat, sur toute la durée.
  const pulseFeat = new Map(input.pulses.map((p) => [p.id, p.feat]));
  const sessionFeat = new Map(input.pulses.filter((p) => p.session).map((p) => [p.session, p.feat]));
  const spent: Record<string, number> = {};
  for (const s of input.sessions) {
    const feat = pulseFeat.get(s.pulse) || sessionFeat.get(s.id);
    if (feat) spent[feat] = (spent[feat] ?? 0) + Math.round(s.tokens / 1000);
  }
  const current = input.cycles.find((c) => c.state === 'En cours') ?? null;
  const cycleFeats = current ? input.feats.filter((f) => f.cycle === current.id) : [];
  let forecast = '';
  let worst = -Infinity;
  for (const f of current ? cycleFeats : input.feats) {
    const total = input.pulses.filter((p) => p.feat === f.id).length;
    const done = input.pulses.filter((p) => p.feat === f.id && p.state === 'done').length;
    const s = spent[f.id] ?? 0;
    if (!f.budget || !s || !total || !done || done >= total) continue;
    const est = Math.round((s * total) / done);
    const over = Math.round(((est - f.budget) / f.budget) * 100);
    if (over > worst) {
      worst = over;
      forecast = over > 0
        ? `Estimation de la fin pour ${f.id} : ${est}k tokens, soit un dépassement probable de ${over} %.`
        : `Estimation de la fin pour ${f.id} : ${est}k tokens, dans le budget de ${f.budget}k.`;
    }
  }

  // Briques (skills et documents) utilisées par les sessions de la période.
  const counts = new Map<string, { kind: string; label: string; count: number }>();
  for (const s of win) for (const b of new Map(s.bricks.map((x) => [x.kind + '|' + x.label, x])).values()) {
    const k = b.kind + '|' + b.label;
    counts.set(k, { ...b, count: (counts.get(k)?.count ?? 0) + 1 });
  }
  for (const sk of input.skills) if (!counts.has('Skill|' + sk)) counts.set('Skill|' + sk, { kind: 'Skill', label: sk, count: 0 });
  const bricks = [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 12);
  const brickTotal = win.filter((s) => s.bricks.length).length;
  const unused = bricks.filter((b) => b.kind === 'Skill' && b.count === 0).map((b) => b.label);

  // Relances moyennes par session, 4 dernières semaines.
  const weeks = [3, 2, 1, 0].map((i) => {
    const from = input.now - (i + 1) * 7 * DAY;
    const to = input.now - i * 7 * DAY;
    const ss = input.sessions.filter((s) => s.startedAt >= from && s.startedAt < to);
    const r = ss.reduce((a, s) => a + s.nodes.reduce((x, n) => x + n.retries, 0), 0);
    return { label: i === 0 ? 'Cette sem.' : 'S-' + i, value: ss.length ? Math.round((r / ss.length) * 10) / 10 : 0 };
  });

  const issues: StatsData['issues'] = [];
  const retries = detailed ? dn.reduce((a, n) => a + n.retries, 0) : 0;
  const avgRetries = win.length ? win.reduce((a, s) => a + s.nodes.reduce((x, n) => x + n.retries, 0), 0) / win.length : 0;
  if (avgRetries >= 2) issues.push({ title: 'Relances en boucle', level: 'Élevé', text: `${(Math.round(avgRetries * 10) / 10).toString().replace('.', ',')} relances par session en moyenne cette semaine.` });
  if (top && dTokens && dn.length >= 3 && top.tokens / dTokens >= 0.5) {
    issues.push({ title: `${top.label} concentre le coût`, level: top.tokens / dTokens >= 0.6 ? 'Élevé' : 'Moyen', text: `${Math.round((top.tokens / dTokens) * 100)} % des tokens de la session ${detailed?.name}. Vérifie le modèle choisi et les relances.` });
  }
  if (totalMs && waitMs / totalMs >= 0.25) {
    const sans = decided.length >= 5 && approved / decided.length >= 0.8;
    issues.push({ title: 'Attente de ta validation', level: 'Moyen', text: sans
      ? `Tu valides sans modifier ${approved} fois sur ${decided.length}. Cette étape pourrait être automatique pour les petits changements.`
      : `${Math.round((waitMs / totalMs) * 100)} % du temps des sessions se passe à attendre ta validation.` });
  }

  return {
    period: WINDOW_DAYS + ' jours',
    kpis: [
      { label: 'Tokens', value: fmtK(totalTokens), note: `sur ${WINDOW_DAYS} jours` },
      { label: 'Temps agent', value: fmtDuration(Math.max(0, totalMs - waitMs)), note: waitMs ? `dont ${fmtDuration(waitMs)} à attendre ta validation` : 'sans attente de validation' },
      { label: 'Sessions', value: String(win.length), note: `${names.size} projet${names.size > 1 ? 's' : ''}` },
      { label: 'Validé sans modification', value: decided.length ? `${approved} sur ${decided.length}` : '0', note: 'décisions prises cette semaine' }
    ],
    session: {
      name: detailed?.name ?? '', nodes: costNodes, edges: detailed?.edges ?? [],
      worstTitle: top && dTokens ? 'Branche la plus chère : ' + top.label : '',
      worstText: top && dTokens ? `${fmtK(top.tokens)} tokens, soit ${Math.round((top.tokens / dTokens) * 100)} % de la session${retries ? `, avec ${retries} relances` : ''}.` : ''
    },
    saved: [],
    brickTotal, bricks,
    brickAlert: brickTotal && unused.length ? `Jamais choisis cette semaine : ${unused.slice(0, 4).join(', ')}.` : '',
    featSpent: spent,
    cycleLabel: current?.title ?? '', cycleBudget: cycleFeats.reduce((a, f) => a + f.budget, 0),
    forecast, weeks, gantt, ganttMax: Math.max(1, ...gantt.map((g) => g.end)), issues
  };
}

const statsFile = (root: string) => path.join(root, 'stats', 'usage.md');

function newestSession(root: string): number {
  const dir = path.join(root, 'sessions');
  if (!fs.existsSync(dir)) return 0;
  return Math.max(0, ...fs.readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => fs.statSync(path.join(dir, f)).mtimeMs));
}

/**
 * Recalcule stats/usage.md d'après sessions/. Sans `force`, ne touche pas un fichier écrit à la main
 * (sans la marque du collecteur) et ne recalcule que si une session est plus récente ou si le fichier a plus d'une heure.
 * Renvoie vrai si le fichier a été écrit.
 */
export function rebuildStats(root: string, force = false): boolean {
  if (!root || !fs.existsSync(root)) return false;
  const file = statsFile(root);
  const sessions = readSessions(root);
  if (!sessions.length && !force) return false;
  if (!force && fs.existsSync(file)) {
    const mine = matter(fs.readFileSync(file, 'utf8')).data.generatedBy === 'collector';
    const age = fs.statSync(file).mtimeMs;
    if (!mine || (age >= newestSession(root) && Date.now() - age < 3_600_000)) return false;
  }
  const p = loadProject(root);
  const stats = computeStats({
    sessions,
    feats: p.feats.map((f) => ({ id: f.id, budget: f.budget ?? 0, cycle: f.cycle })),
    pulses: p.pulses.map((x) => ({ id: x.id, feat: x.feat, state: x.state, session: x.session })),
    cycles: p.cycles.map((c) => ({ id: c.id, title: c.title, state: c.state })),
    skills: [...new Set(p.library.flatMap((n) => n.skills))],
    now: Date.now()
  });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, matter.stringify('Écrit par le collecteur de l\'application, d\'après les fichiers de sessions/. Recalculé après chaque session.\n', {
    generatedBy: 'collector', generatedAt: new Date().toISOString(), ...stats
  }));
  return true;
}

/** À appeler après tout changement de session. Une erreur de calcul ne doit jamais gêner la session. */
export function refreshStats(root: string, force = false): void {
  try { rebuildStats(root, force); } catch { /* les stats se recalculeront à la prochaine occasion */ }
}
