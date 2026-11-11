import { query } from '@anthropic-ai/claude-agent-sdk';
import type { CanUseTool } from '@anthropic-ai/claude-agent-sdk';
import { randomUUID } from 'node:crypto';
import type { McpCall, RunEvent } from '../src/shared/types';
import { appendFollowUp, readClaudeSessionId, writeSessionFile } from './project-store';
import { runWorkflow } from './workflow-engine';
import { refreshStats } from './stats';
import { bgEvents } from './units';
import { appendMcp, describeMcp, nowTime, resultOf } from './mcp-log';
import path from 'node:path';

/** Ces outils ne modifient rien : ils passent sans demander. Tout le reste attend ton accord. */
export const READ_ONLY = ['Read', 'Glob', 'Grep'];
const MAX_TURNS = 20;

interface Run {
  abort: AbortController;
  asks: Map<string, (allow: boolean) => void>;
}
const running = new Map<string, Run>();

const detailOf = (input: Record<string, unknown>): string => {
  const v = input.file_path ?? input.path ?? input.pattern ?? input.command ?? '';
  return typeof v === 'string' ? v.slice(0, 200) : '';
};

/** Pose une question à l'utilisateur et attend sa réponse. Arrêter la session répond « non » à tout. */
export function ask(runId: string, emit: (e: RunEvent) => void, ask: 'permission' | 'human', title: string, detail: string): Promise<boolean> {
  const run = running.get(runId);
  if (!run || run.abort.signal.aborted) return Promise.resolve(false);
  const id = randomUUID();
  return new Promise<boolean>((resolve) => {
    run.asks.set(id, (allow) => {
      run.asks.delete(id);
      emit({ runId, kind: 'asked', id });
      resolve(allow);
    });
    emit({ runId, kind: 'ask', id, ask, title, detail });
  });
}

export function answerAsk(runId: string, askId: string, allow: boolean): void {
  running.get(runId)?.asks.get(askId)?.(allow);
}

/** Modèle par défaut (réglage Options). Vide : celui de Claude Code. */
let defaultModel = '';
export function setDefaultModel(model: string) { defaultModel = model; }

export interface AgentOptions {
  runId: string;
  prompt: string;
  cwd: string;
  /** Outils que l'agent a le droit de demander (en plus de la lecture). */
  tools: string[];
  model?: string;
  /** Nom de l'étape de workflow qui lance l'agent, pour le journal MCP. */
  node?: string;
  resume?: string;
  emit: (e: RunEvent) => void;
  onText?: (text: string) => void;
}
export interface AgentResult { ok: boolean; text: string; tokens: number; costUsd: number; actions: number; sessionId: string; error: string }

export async function runAgent(o: AgentOptions): Promise<AgentResult> {
  const run = running.get(o.runId);
  const result: AgentResult = { ok: false, text: '', tokens: 0, costUsd: 0, actions: 0, sessionId: '', error: '' };
  if (!run) return { ...result, error: 'Session introuvable.' };
  const granted = [...READ_ONLY, ...o.tools];

  const canUseTool: CanUseTool = async (toolName, input) => {
    if (READ_ONLY.includes(toolName)) return { behavior: 'allow', updatedInput: input };
    if (!granted.includes(toolName)) {
      o.emit({ runId: o.runId, kind: 'denied', name: toolName });
      return { behavior: 'deny', message: "Cet agent n'a pas le droit d'utiliser cet outil." };
    }
    const ok = await ask(o.runId, o.emit, 'permission', toolName, detailOf(input));
    return ok ? { behavior: 'allow', updatedInput: input } : { behavior: 'deny', message: "L'utilisateur a refusé." };
  };

  // Appels MCP en attente de leur résultat, par identifiant d'outil.
  const mcpPending = new Map<string, { time: string; server: string; action: string; kind: string }>();
  const mcpDone: McpCall[] = [];
  const project = path.basename(o.cwd);
  const closeMcp = (id: string, result: string) => {
    const p = mcpPending.get(id);
    if (!p) return;
    mcpPending.delete(id);
    mcpDone.push({ ...p, node: o.node || 'Agent libre', project, result });
  };

  try {
    const stream = query({
      prompt: o.prompt,
      options: {
        cwd: o.cwd,
        tools: granted,
        allowedTools: READ_ONLY,
        permissionMode: 'default',
        canUseTool,
        abortController: run.abort,
        settingSources: ['project'],
        maxTurns: MAX_TURNS,
        ...((o.model || defaultModel) ? { model: o.model || defaultModel } : {}),
        ...(o.resume ? { resume: o.resume } : {})
      }
    });
    for await (const msg of stream) {
      if ('session_id' in msg && typeof msg.session_id === 'string' && msg.session_id) result.sessionId = msg.session_id;
      if (msg.type === 'assistant') {
        for (const block of msg.message.content) {
          if (block.type === 'text' && block.text.trim()) {
            result.text = block.text;
            o.emit({ runId: o.runId, kind: 'text', text: block.text });
            o.onText?.(block.text);
          } else if (block.type === 'tool_use') {
            result.actions += 1;
            const mcp = describeMcp(block.name, (block.input ?? {}) as Record<string, unknown>);
            if (mcp) mcpPending.set(block.id, { time: nowTime(), server: mcp.server, action: mcp.action, kind: mcp.kind });
            const d = detailOf((block.input ?? {}) as Record<string, unknown>);
            o.emit({ runId: o.runId, kind: 'tool', name: block.name, detail: d });
          }
        }
      } else if (msg.type === 'user' && Array.isArray(msg.message.content)) {
        for (const block of msg.message.content) {
          if (typeof block === 'object' && block && 'type' in block && block.type === 'tool_result' && 'tool_use_id' in block) {
            const raw = 'content' in block ? block.content : '';
            const text = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw.map((x) => (typeof x === 'object' && x && 'text' in x ? String(x.text) : '')).join(' ') : '';
            closeMcp(String(block.tool_use_id), resultOf('is_error' in block && block.is_error === true, text));
          }
        }
      } else if (msg.type === 'result') {
        result.tokens = (msg.usage?.input_tokens ?? 0) + (msg.usage?.output_tokens ?? 0);
        result.costUsd = msg.total_cost_usd ?? 0;
        if (msg.subtype === 'success' && !msg.is_error) {
          result.ok = true;
          result.text = msg.result || result.text;
        } else {
          result.error = 'La session a échoué (' + msg.subtype + ').';
        }
      }
    }
  } catch (error) {
    result.ok = false;
    result.error = run.abort.signal.aborted ? 'Session arrêtée.' : error instanceof Error ? error.message : String(error);
  }
  for (const id of [...mcpPending.keys()]) closeMcp(id, 'Sans réponse');
  try { appendMcp(o.cwd, mcpDone); } catch { /* le journal ne doit jamais faire échouer une session */ }
  return result;
}

export function startRun(
  prompt: string, cwd: string, root: string, emit: (event: RunEvent) => void,
  options: { followUp?: string; workflow?: string; route?: { confidence: number; text: string } } = {}
): string {
  const runId = randomUUID();
  const abort = new AbortController();
  running.set(runId, { abort, asks: new Map() });

  void (async () => {
    const started = Date.now();
    try {
      if (options.workflow) {
        await runWorkflow({ runId, root, cwd, prompt, workflowId: options.workflow, emit, abort: abort.signal, route: options.route });
        return;
      }
      const resume = options.followUp ? readClaudeSessionId(root, options.followUp) : '';
      if (options.followUp && !resume) throw new Error("Cette session n'a pas d'identifiant Claude : elle ne peut pas être poursuivie.");
      const r = await runAgent({ runId, prompt, cwd, tools: ['Edit', 'Write', 'Bash'], resume, emit });
      if (!r.ok) {
        emit({ runId, kind: 'error', message: r.error || 'La session a échoué.' });
        return;
      }
      const summary = { prompt, answer: r.text, cwd, tokens: r.tokens, durationMs: Date.now() - started, actions: r.actions, claudeSessionId: r.sessionId, route: options.route };
      const file = options.followUp ? appendFollowUp(root, options.followUp, summary) : writeSessionFile(root, summary);
      refreshStats(root);
      bgEvents.emit('session');
      emit({ runId, kind: 'done', tokens: r.tokens, costUsd: r.costUsd, durationMs: Date.now() - started, file });
    } catch (error) {
      emit({ runId, kind: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      const run = running.get(runId);
      if (run) for (const resolve of [...run.asks.values()]) resolve(false);
      running.delete(runId);
    }
  })();

  return runId;
}

export function stopRun(runId: string): void {
  const run = running.get(runId);
  if (!run) return;
  run.abort.abort();
  for (const resolve of [...run.asks.values()]) resolve(false);
}

/** Pose une question à Claude, lecture seule, sans session ni fichier. Sert au découpage d'une feat. */
export async function askClaude(prompt: string, cwd: string, model?: string): Promise<string> {
  return (await askClaudeUsage(prompt, cwd, model)).text;
}

/** Comme askClaude, avec le nombre de tokens consommés (pour le plafond des tâches de fond). */
export async function askClaudeUsage(prompt: string, cwd: string, model?: string): Promise<{ text: string; tokens: number }> {
  const runId = randomUUID();
  running.set(runId, { abort: new AbortController(), asks: new Map() });
  try {
    const res = await runAgent({ runId, prompt, cwd, tools: [], model, emit: () => undefined });
    if (!res.ok) throw new Error(res.error || 'Claude n\'a pas répondu.');
    return { text: res.text, tokens: res.tokens };
  } finally {
    running.delete(runId);
  }
}
