import fs from 'node:fs';
import path from 'node:path';
import type { ScriptFile } from '../src/shared/types';
import { SCRIPT_NAME } from '../src/shared/entities';

const MAX_BYTES = 100_000;
const dirOf = (root: string) => path.join(root, 'scripts');

function check(name: string): string {
  const n = String(name ?? '').trim();
  if (!SCRIPT_NAME.test(n)) throw new Error('Nom refusé : lettres, chiffres, tirets, et une fin en .sh, .mjs ou .py.');
  return n;
}

/** Scripts du dossier scripts/ du projet (un seul niveau). */
export function listScripts(root: string): ScriptFile[] {
  const dir = dirOf(root);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && SCRIPT_NAME.test(e.name))
    .map((e) => {
      const full = path.join(dir, e.name);
      const st = fs.statSync(full);
      return { name: e.name, content: fs.readFileSync(full, 'utf8'), size: st.size, updated: st.mtime.toISOString().slice(0, 10) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function saveScript(root: string, name: string, content: string, create: boolean): void {
  const n = check(name);
  const text = String(content ?? '').replace(/\r\n/g, '\n');
  if (Buffer.byteLength(text) > MAX_BYTES) throw new Error('Script trop long (100 Ko au plus).');
  if (!text.trim()) throw new Error('Le script est vide.');
  const full = path.join(dirOf(root), n);
  if (create && fs.existsSync(full)) throw new Error('Un script porte déjà ce nom.');
  if (!create && !fs.existsSync(full)) throw new Error('Script introuvable : ' + n);
  fs.mkdirSync(dirOf(root), { recursive: true });
  fs.writeFileSync(full, text.endsWith('\n') ? text : text + '\n');
  if (n.endsWith('.sh')) fs.chmodSync(full, 0o755);
}

export function deleteScript(root: string, name: string): void {
  const full = path.join(dirOf(root), check(name));
  if (!fs.existsSync(full)) throw new Error('Script introuvable : ' + name);
  fs.unlinkSync(full);
}
