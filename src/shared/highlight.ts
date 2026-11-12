/** Coloration syntaxique légère pour l'éditeur de l'onglet Fichiers : chaînes, commentaires, mots-clés, nombres, balises. */

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ESC[c]);
const regEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

interface Spec { block?: string; line?: string; tags?: boolean; kw: string }

const SPECS: Record<string, Spec> = {
  js: {
    block: '/*', line: '//',
    kw: 'as async await break case catch class const continue debugger default delete do else enum export extends false finally for from function get if implements import in instanceof interface let new null of private protected public readonly return set static super switch this throw true try type typeof undefined var void while yield'
  },
  py: {
    line: '#',
    kw: 'and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield'
  },
  sh: {
    line: '#',
    kw: 'case do done elif else esac export fi for function if in local return then until while'
  },
  css: { block: '/*', kw: '' },
  json: { kw: 'true false null' }
};

/** Jeu de règles d'un langage : une regex alternée, l'ordre des alternatives est le même que dans kindOf. */
function makeLang(spec: Spec) {
  const parts = [
    spec.block ? regEsc(spec.block) + '[\\s\\S]*?\\*' + '/' : '',
    spec.line ? regEsc(spec.line) + '[^\\n]*' : '',
    '"""[\\s\\S]*?"""',
    '"(?:\\\\.|[^"\\\\\\n])*"',
    "'(?:\\\\.|[^'\\\\\\n])*'",
    '`(?:\\\\.|[^`\\\\])*`',
    spec.tags ? '<\\/?[A-Za-z][A-Za-z0-9-]*|\\/?>' : '',
    '[A-Za-z_$@][A-Za-z0-9_$-]*',
    '\\d[\\w.]*'
  ].filter(Boolean);
  return {
    re: new RegExp(parts.join('|'), 'g'),
    kw: new Set(spec.kw.split(' ').filter(Boolean)),
    block: spec.block,
    line: spec.line
  };
}

type Lang = ReturnType<typeof makeLang>;

const cache: Record<string, Lang> = {
  js: makeLang(SPECS.js),
  vue: makeLang({ ...SPECS.js, tags: true }),
  py: makeLang(SPECS.py),
  sh: makeLang(SPECS.sh),
  css: makeLang(SPECS.css),
  json: makeLang(SPECS.json)
};

const langOf = (rel: string): Lang | null => {
  const ext = (/\.([a-z]+)$/i.exec(rel.toLowerCase()) ?? [])[1] ?? '';
  if (['js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx'].includes(ext)) return cache.js;
  if (['vue', 'html', 'htm', 'xml', 'svelte'].includes(ext)) return cache.vue;
  if (ext === 'py') return cache.py;
  if (['sh', 'bash', 'zsh'].includes(ext)) return cache.sh;
  if (['css', 'scss', 'sass', 'less'].includes(ext)) return cache.css;
  if (ext === 'json' || ext === 'lock') return cache.json;
  return null;
};

/** Classe d'un token reconnu par la regex alternée, d'après son début (même ordre que makeLang). */
function kindOf(lang: Lang, tok: string): string {
  if (lang.kw.has(tok)) return 'kw';
  if (tok.startsWith('"') || tok.startsWith("'") || tok.startsWith('`')) return 'str';
  if (tok.startsWith('"""') || (lang.block && tok.startsWith(lang.block)) || (lang.line && tok.startsWith(lang.line))) return 'cm';
  if (tok.startsWith('<') || tok === '>' || tok.startsWith('/>')) return 'tk';
  if (/^\d/.test(tok)) return 'num';
  return '';
}

/** Renvoie du HTML sûr : tokens entourés d'un span coloré, le reste échappé. Sans coloration pour les types simples (md, txt, yaml). */
export function highlight(code: string, relPath: string): string {
  const lang = langOf(relPath);
  if (!lang) return esc(code);
  const out: string[] = [];
  let last = 0;
  for (const m of code.matchAll(lang.re)) {
    const tok = m[0];
    out.push(esc(code.slice(last, m.index)));
    const kind = kindOf(lang, tok);
    out.push(kind ? '<span class="' + kind + '">' + esc(tok) + '</span>' : esc(tok));
    last = m.index + tok.length;
  }
  out.push(esc(code.slice(last)));
  return out.join('');
}
