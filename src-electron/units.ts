/** Conversions de nombres, de durées et de coûts partagées par les stats et les versions. */

export const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** « 31k » → 31000, « 1,2M » → 1200000, « 840 » → 840. */
export function parseTokens(s: unknown): number {
  const m = /(\d+(?:[.,]\d+)?)\s*([kKmM]?)/.exec(String(s ?? ''));
  if (!m) return 0;
  const n = Number(m[1].replace(',', '.'));
  return Math.round(m[2].toLowerCase() === 'm' ? n * 1_000_000 : m[2].toLowerCase() === 'k' ? n * 1000 : n);
}

/** « 1 h 10 », « 3 min 30 », « 20 s », « 6 min » → millisecondes. */
export function parseDuration(s: unknown): number {
  const t = String(s ?? '').toLowerCase().replace(',', '.');
  let ms = 0;
  const hm = /(\d+(?:\.\d+)?)\s*h(?:\s*(\d+)(?!\s*(?:min|s\b)))?/.exec(t);
  if (hm) ms += Number(hm[1]) * 3_600_000 + (hm[2] ? Number(hm[2]) * 60_000 : 0);
  const mm = /(\d+(?:\.\d+)?)\s*min(?:\s*(\d+)(?!\s*(?:min|s\b|k)))?/.exec(t);
  if (mm) ms += Number(mm[1]) * 60_000 + (mm[2] ? Number(mm[2]) * 1000 : 0);
  if (!hm && !mm) {
    const ss = /(\d+(?:\.\d+)?)\s*s\b/.exec(t);
    if (ss) ms += Number(ss[1]) * 1000;
  }
  return Math.round(ms);
}

export const fmtK = (tokens: number) => (tokens >= 1_000_000 ? (tokens / 1_000_000).toFixed(1).replace('.', ',') + ' M' : Math.round(tokens / 1000) + 'k');
export function fmtDuration(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min >= 60) return Math.floor(min / 60) + ' h ' + String(min % 60).padStart(2, '0');
  if (min >= 1) return min + ' min';
  return Math.max(1, Math.round(ms / 1000)) + ' s';
}


import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

/** Événements internes : « session » est émis quand une session se termine (déclencheur des tâches de fond). */
export const bgEvents = new EventEmitter();

/** Empreinte de ce qu'une tâche de fond exécute : si elle change, l'accord donné ne vaut plus. */
export const taskHash = (t: { type: string; command: string; prompt: string }): string =>
  crypto.createHash('sha1').update([t.type, t.command, t.prompt].join('\u0000')).digest('hex').slice(0, 16);

/** « il y a 4 min », « hier », d'après une date ISO. */
export function ago(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const min = Math.max(0, Math.round((now - t) / 60000));
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  if (min < 24 * 60) return `il y a ${Math.round(min / 60)} h`;
  const days = Math.round(min / 1440);
  return days === 1 ? 'hier' : `il y a ${days} jours`;
}
