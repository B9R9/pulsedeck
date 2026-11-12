import fs from 'node:fs';
import path from 'node:path';
import { askClaude } from './claude-runner';
import type { FileEntry, FileEditRequest, ProjectFile } from '../src/shared/types';

/** Dossiers et fichiers jamais montrés ni modifiables dans l'onglet Fichiers : gros dossiers, base interne de git et déchets. Les autres dossiers cachés restent visibles. */
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.DS_Store']);
const MAX_ENTRIES = 4000;
const MAX_BYTES = 1_000_000;
const PROMPT_MAX = 40_000;

const fail = (m: string): never => { throw new Error(m); };

/** Résout un chemin relatif en restant dans le projet, éventuellement dans un sous-dossier existant. */
function safeJoin(root: string, rel: string): string {
  const clean = String(rel ?? '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!clean) fail('Chemin de fichier vide.');
  if (clean.split('/').some((p) => p === '..')) fail('Chemin hors du projet refusé : ' + rel);
  const full = path.resolve(root, clean);
  if (full !== root && !full.startsWith(root + path.sep)) fail('Chemin hors du projet refusé : ' + rel);
  if (path.relative(root, full).split(path.sep).some((p) => SKIP.has(p))) fail('Ce dossier n\'est pas visible dans l\'onglet Fichiers.');
  return full;
}

/** Suffisamment textuel pour l'éditeur : pas d'octet nul et pas d'extension binaire connue. */
const BINARY_EXT = /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tar|dmg|exe|dll|so|dylib|woff2?|ttf|otf|mp[34]|wav|ogg|mov|sqlite)$/i;

function walk(root: string, rel: string, depth: number, out: FileEntry[]) {
  const full = path.join(root, rel);
  let names: fs.Dirent[];
  try { names = fs.readdirSync(full, { withFileTypes: true }); } catch { return; }
  const kept = names.filter((n) => !SKIP.has(n.name))
    .sort((a, b) => (a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1));
  for (const n of kept) {
    if (out.length >= MAX_ENTRIES) return;
    const child = rel ? rel + '/' + n.name : n.name;
    if (n.isDirectory()) {
      out.push({ path: child, dir: true, depth, size: 0 });
      walk(root, child, depth + 1, out);
    } else {
      let size = 0;
      try { size = fs.statSync(path.join(root, child)).size; } catch { /* fichier disparu */ }
      out.push({ path: child, dir: false, depth, size });
    }
  }
}

/** Arborescence du projet, parents avant enfants, profondeur limitée par MAX_ENTRIES. */
export function listFileTree(root: string): FileEntry[] {
  const out: FileEntry[] = [];
  walk(root, '', 0, out);
  return out;
}

/** Lit un fichier du projet sous forme de texte. Rien d'écrit ici. */
export function readProjectFile(root: string, rel: string): ProjectFile {
  const full = safeJoin(root, rel);
  if (BINARY_EXT.test(rel)) fail('Le fichier est binaire : il ne peut pas être ouvert dans l\'éditeur.');
  let st: fs.Stats;
  try { st = fs.statSync(full); } catch { fail('Fichier introuvable : ' + rel); }
  if (!st.isFile()) fail('Ce chemin n\'est pas un fichier : ' + rel);
  if (st.size > MAX_BYTES) fail('Fichier trop grand pour l\'éditeur (' + Math.round(st.size / 1000) + ' ko, maximum 1 000 ko).');
  const buf = fs.readFileSync(full);
  if (buf.includes(0)) fail('Le fichier est binaire : il ne peut pas être ouvert dans l\'éditeur.');
  return { path: String(rel), content: buf.toString('utf8'), size: st.size, updated: st.mtime.toISOString() };
}

/** Écrit un fichier du projet (création possible, dossiers parents créés). Appelé sur décision explicite de l'utilisateur. */
export function writeProjectFile(root: string, rel: string, content: string): void {
  const full = safeJoin(root, rel);
  const text = String(content ?? '');
  if (Buffer.byteLength(text, 'utf8') > MAX_BYTES) fail('Contenu trop grand pour l\'éditeur (maximum 1 000 ko).');
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, text, 'utf8');
}

const clip = (s: unknown, n: number) => String(s ?? '').replace(/\r/g, '').trim().slice(0, n);

/** Retire un bloc de code englobant renvoyé par le modèle. */
function stripFence(t: string): string {
  const m = /^```[^\n]*\n([\s\S]*)\n```$/.exec(t.trim());
  return (m ? m[1] : t).trim();
}

/** Demande à Claude une nouvelle version du fichier, ou de la sélection seule. N'écrit rien. */
export async function suggestFileEdit(root: string, req: FileEditRequest, model?: string): Promise<string> {
  const rel = clip(req?.path, 200);
  if (!rel) fail('Aucun fichier ouvert.');
  const instruction = clip(req?.instruction, 2000);
  if (!instruction) fail('Décris la modification souhaitée.');
  const content = clip(req?.content, PROMPT_MAX);
  const sel = req?.selection;
  const prompt = [
    sel
      ? 'Tu modifies une sélection dans un fichier du projet. Renvoie uniquement le nouveau texte de la sélection, ajusté à la consigne, qui remplacera exactement la partie choisie. Ne modifie rien en dehors, ne renvoie pas le fichier entier.'
      : 'Tu modifies un fichier du projet. Garde son style, son indentation et ce qui reste juste. Ne change que ce que la consigne demande. N\'invente rien.',
    `Fichier : ${rel}`,
    `Consigne : ${instruction}`,
    sel
      ? `Sélection à remplacer :\n<<<\n${clip(sel.text, PROMPT_MAX)}\n>>>`
      : '',
    `Contenu du fichier (contexte${sel ? ', ne doit pas se retrouver dans la réponse' : ''}) :\n<<<\n${content}\n>>>`,
    'Règles : réponds en français pour les commentaires, uniquement avec ' + (sel ? 'le nouveau texte de la sélection' : 'le contenu complet du fichier') + ', sans introduction ni conclusion ni bloc de code autour. Pas de tirets longs (— ou –).'
  ].filter(Boolean).join('\n\n');
  let out = stripFence(await askClaude(prompt, root, model));
  if (!out) fail('Claude n\'a rien proposé. Réessaie avec une autre consigne.');
  if (out.length > PROMPT_MAX) fail('La proposition est trop longue.');
  return out;
}

