import http from 'node:http';
import { LOCAL_MODELS } from '../src/shared/entities';
import type { LocalModel } from '../src/shared/types';

/** Adresse de l'API Ollama. */
const OLLAMA = 'http://localhost:11434';

/** Durée de la requête : au-delà, Ollama est considéré injoignable. */
const TIMEOUT_MS = 1500;
/** Durée de vie du cache : évite d'interroger Ollama à chaque ouverture de formulaire. */
const CACHE_MS = 5000;
/** Nombre maximal de modèles locaux gérés. */
const MAX_LOCAL_MODELS = 50;

let cache: { at: number; models: string[] } | null = null;

/** Demande les modèles installés à Ollama (`ollama list`). Renvoie [] si Ollama ne répond pas. */
function fetchOllamaModels(): Promise<string[]> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (models: string[]) => {
      if (!settled) { settled = true; resolve(models); }
    };
    const req = http.get(OLLAMA + '/api/tags', { timeout: TIMEOUT_MS }, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body) as { models?: { name?: unknown }[] };
          done((parsed.models ?? []).map((m) => String(m.name ?? '')).filter((n) => n && n !== ':'));
        } catch { done([]); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('Délai dépassé')));
    req.on('error', () => done([]));
  });
}

/** Liste brute des noms Ollama, ou à défaut les modèles locaux connus. Durée de vie du cache : 5 s. */
export async function ollamaModels(): Promise<string[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.models;
  const models = [...new Set(await fetchOllamaModels())].sort();
  cache = { at: Date.now(), models: models.length ? models : LOCAL_MODELS };
  return cache.models;
}

/** Libellé court : préfixe hf.co retiré, nom de fichier seul, sans l'étiquette de quantification. */
export function labelOf(name: string): string {
  return (name.split('/').pop() ?? name).split(':')[0] || name;
}

/** Reconnaît un modèle d'embeddings : illisible en session, il est ignoré par défaut. */
const EMBED = /embed|bge-|nomic|minilm|-e5|gte-/i;

/** Vérifie et borne la liste enregistrée dans la configuration. */
export function sanitizeLocalModels(v: unknown): LocalModel[] {
  if (!Array.isArray(v)) return [];
  const out: LocalModel[] = [];
  for (const raw of v.slice(0, MAX_LOCAL_MODELS)) {
    const m = (raw && typeof raw === 'object' ? raw : {}) as { id?: unknown; label?: unknown; on?: unknown };
    const id = typeof m.id === 'string' ? m.id.slice(0, 200) : '';
    if (!id) continue;
    const label = (typeof m.label === 'string' && m.label.trim().slice(0, 60)) || labelOf(id);
    out.push({ id, label, on: m.on === true });
  }
  return out;
}

/** Modèles locaux gérés : la configuration enregistrée, complétée par ce qu'Ollama découvre. Les modèles retirés d'Ollama sortent de la liste. */
export function mergeLocalModels(saved: LocalModel[], discovered: string[]): LocalModel[] {
  if (!discovered.length) return saved.slice(0, MAX_LOCAL_MODELS);
  const byId = new Map(saved.map((m) => [m.id, m]));
  return discovered.map((id) => {
    const m = byId.get(id);
    if (m) return { id, label: m.label || labelOf(id), on: m.on === true };
    return { id, label: labelOf(id), on: !EMBED.test(id) };
  }).slice(0, MAX_LOCAL_MODELS);
}

/** Modèles locaux utilisables : ceux marqués actifs dans la configuration. */
export async function usableLocalModels(saved: LocalModel[]): Promise<LocalModel[]> {
  return mergeLocalModels(saved, await ollamaModels()).filter((m) => m.on);
}
