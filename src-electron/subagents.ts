import fs from 'node:fs';
import path from 'node:path';
import type { SubAgent, WorkflowDef } from '../src/shared/types';

const DIR = ['.claude', 'agents'];
const MARK = /<!-- claudeUI : ([a-z0-9-]+)\/([a-z0-9-]+) -->/;
const MODEL: Record<string, string> = { 'Haiku 5.5': 'haiku', 'Sonnet 5.5': 'sonnet', 'Opus 5.5': 'opus' };
const TOOL: Record<string, string[]> = { Lecture: [], 'Édition': ['Edit', 'Write'], Commandes: ['Bash'], Web: ['WebFetch', 'WebSearch'] };

const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
export const agentsDir = (root: string) => path.join(root, ...DIR);
const fileOf = (root: string, name: string) => path.join(agentsDir(root), name + '.md');
const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Contenu exact du fichier attendu pour une étape agent d'un workflow. */
export function agentFile(wf: WorkflowDef, node: WorkflowDef['nodes'][number]): { name: string; content: string; tools: string[]; model: string } {
  const name = slug(wf.id + '-' + node.id) || 'agent';
  const tools = ['Read', 'Glob', 'Grep', ...new Set(node.tools.flatMap((t) => TOOL[t] ?? []))];
  const model = MODEL[node.model] ?? '';
  const desc = oneLine(`${node.label || node.id}. Étape du workflow « ${wf.name} »${wf.when ? ' (' + wf.when + ')' : ''}. Utilise-le pour cette étape précisément.`);
  const front = [
    '---',
    `name: ${name}`,
    `description: ${JSON.stringify(desc)}`,
    `tools: ${tools.join(', ')}`,
    ...(model ? [`model: ${model}`] : []),
    '---'
  ].join('\n');
  const body = [
    node.prompt.trim() || `Tu es l'agent « ${node.label || node.id} ».`,
    node.success.trim() ? `## Critère de réussite\n\n${node.success.trim()}\nQuand tu as fini, dis clairement si ce critère est rempli et comment tu l'as vérifié.` : '',
    '## Règles\n\nTu ne modifies rien en dehors de ce que la tâche demande. Si une action est risquée ou ambiguë, tu la décris et tu attends la décision de l\'utilisateur.'
  ].filter(Boolean).join('\n\n');
  return { name, content: `${front}\n\n${body}\n\n<!-- claudeUI : ${wf.id}/${node.id} -->\n`, tools, model };
}

/** État de chaque sous-agent attendu, plus ceux que l'app avait écrits et dont l'étape a disparu. */
export function listSubagents(root: string, workflows: WorkflowDef[]): SubAgent[] {
  const out: SubAgent[] = [];
  const wanted = new Set<string>();
  for (const wf of workflows) {
    for (const n of wf.nodes) {
      if (n.type !== 'agent') continue;
      const a = agentFile(wf, n);
      wanted.add(a.name);
      let state: SubAgent['state'] = 'missing';
      try {
        const cur = fs.readFileSync(fileOf(root, a.name), 'utf8');
        state = cur === a.content ? 'synced' : MARK.test(cur) ? 'outdated' : 'conflict';
      } catch { /* absent */ }
      out.push({ name: a.name, file: `.claude/agents/${a.name}.md`, workflow: wf.id, workflowName: wf.name, node: n.id, label: n.label || n.id, tools: a.tools, model: a.model || 'hérité', state });
    }
  }
  let existing: string[] = [];
  try { existing = fs.readdirSync(agentsDir(root)).filter((f) => f.endsWith('.md')); } catch { /* dossier absent */ }
  for (const f of existing) {
    const name = f.replace(/\.md$/, '');
    if (wanted.has(name)) continue;
    const m = MARK.exec(fs.readFileSync(path.join(agentsDir(root), f), 'utf8'));
    if (m) out.push({ name, file: `.claude/agents/${f}`, workflow: m[1], workflowName: m[1], node: m[2], label: m[2], tools: [], model: '', state: 'orphan' });
  }
  return out;
}

/** Écrit ou met à jour les sous-agents demandés. Un fichier qui n'est pas le sien n'est jamais écrasé. */
export function syncSubagents(root: string, workflows: WorkflowDef[], names: string[]): string[] {
  const done: string[] = [];
  for (const wf of workflows) for (const n of wf.nodes) {
    if (n.type !== 'agent') continue;
    const a = agentFile(wf, n);
    if (!names.includes(a.name)) continue;
    const file = fileOf(root, a.name);
    if (fs.existsSync(file) && !MARK.test(fs.readFileSync(file, 'utf8'))) continue;
    fs.mkdirSync(agentsDir(root), { recursive: true });
    fs.writeFileSync(file, a.content);
    done.push(a.name);
  }
  return done;
}

/** Retire un sous-agent écrit par l'app. Un fichier sans la marque de l'app n'est pas touché. */
export function removeSubagent(root: string, name: string): boolean {
  if (!/^[a-z0-9-]+$/.test(name)) return false;
  const file = fileOf(root, name);
  if (!fs.existsSync(file) || !MARK.test(fs.readFileSync(file, 'utf8'))) return false;
  fs.unlinkSync(file);
  return true;
}
