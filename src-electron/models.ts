import { MODELS } from '../src/shared/entities';

/** Noms affichés dans l'application → identifiants de modèle de l'Agent SDK. */
export const MODEL_IDS: Record<string, string> = {
  'Haiku 5.5': 'claude-haiku-5-5',
  'Sonnet 5.5': 'claude-sonnet-5-5',
  'Opus 5.5': 'claude-opus-5-5'
};

/** Modèles locaux de référence (liste fermée utilisée seulement si Ollama est injoignable). */
export const LOCAL_MODELS: string[] = MODELS.filter((m) => !(m in MODEL_IDS));

/** Alias courts de l'Agent SDK, tels quels. */
const ALIASES = ['sonnet', 'opus', 'haiku'];

/** Résout un réglage de modèle en modèle pour l'Agent SDK. Vide ou inconnu : undefined (modèle par défaut de Claude Code). Les modèles locaux d'Ollama (étiquette avec deux-points) passent tels quels. */
export function resolveModel(name: string | undefined): string | undefined {
  if (!name) return undefined;
  if (name in MODEL_IDS) return MODEL_IDS[name];
  if (ALIASES.includes(name) || name.includes(':') || LOCAL_MODELS.includes(name)) return name;
  return undefined;
}
