import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import type { McpCall } from '../src/shared/types';

const MAX_CALLS = 300;
const READ_VERBS = /^(get|list|read|search|query|fetch|find|describe|show|check|lookup|count|aggregate|download)/i;

/** « mcp__Google_Drive__search_files » → serveur « Google Drive », action « search files ». Renvoie null pour un outil qui n'est pas MCP. */
export function describeMcp(toolName: string, input: Record<string, unknown>): { server: string; action: string; kind: 'lecture' | 'écriture' } | null {
  const m = /^mcp__(.+?)__(.+)$/.exec(toolName);
  if (!m) return null;
  const server = m[1].replace(/^claude[_-]ai[_-]/i, '').replace(/[_-]+/g, ' ').trim();
  const tool = m[2];
  const words = tool.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim();
  const hint = ['title', 'query', 'jql', 'path', 'name', 'url', 'summary', 'sql', 'id', 'fileId', 'issueIdOrKey']
    .map((k) => input[k]).find((v) => typeof v === 'string' && v.trim()) as string | undefined;
  return {
    server,
    action: words.charAt(0).toUpperCase() + words.slice(1) + (hint ? ' : ' + hint.replace(/\s+/g, ' ').slice(0, 80) : ''),
    kind: READ_VERBS.test(tool.replace(/^_+/, '')) ? 'lecture' : 'écriture'
  };
}

const hhmm = (d: Date) => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
export const nowTime = () => hhmm(new Date());

/** Ajoute des appels à logs/mcp.md (les 300 derniers sont gardés). */
export function appendMcp(root: string, calls: McpCall[]): void {
  if (!calls.length) return;
  const file = path.join(root, 'logs', 'mcp.md');
  let existing: unknown[][] = [];
  let note = "Écrit par l'application à chaque appel d'un serveur MCP pendant une session.\n";
  if (fs.existsSync(file)) {
    const parsed = matter(fs.readFileSync(file, 'utf8'));
    if (Array.isArray(parsed.data.calls)) existing = parsed.data.calls.filter(Array.isArray) as unknown[][];
    note = parsed.content.trim() ? parsed.content.trim() + '\n' : note;
  }
  const next = [...existing, ...calls.map((c) => [c.time, c.server, c.action, c.node, c.project, c.kind, c.result])].slice(-MAX_CALLS);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, matter.stringify(note, { calls: next }));
}

/** Résultat affiché d'après la réponse de l'outil. */
export function resultOf(isError: boolean, text: string): string {
  if (!isError) return 'OK';
  return /pas le droit|refus|denied|permission/i.test(text) ? 'Refusé' : 'Erreur';
}
