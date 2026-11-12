/** Schéma des fichiers que l'application peut créer, modifier ou supprimer. Partagé entre le formulaire et la validation côté main. */
export type FieldType = 'string' | 'text' | 'number' | 'bool' | 'enum' | 'list' | 'ref';
export type Opt = { value: string; label: string };

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: Opt[];
  /** Pour type 'ref' : ce que le formulaire propose (cycles, feats, docs, workflows). */
  refKind?: 'cycle' | 'feat' | 'doc' | 'workflow' | 'session' | 'ticket';
  required?: boolean;
  /** Champ enum dont les options ne sont pas exhaustives : toute valeur non vide passe (ex. types de doc personnalisés). */
  freeText?: boolean;
  /** Saisi à la création seulement : c'est le nom du fichier. */
  createOnly?: boolean;
  hint?: string;
  /** Titre de la section du formulaire où le champ s'affiche. */
  section?: string;
  /** Champ court : occupe une demi-ligne. */
  half?: boolean;
  /** N'affiche le champ que pour ces valeurs du champ « type ». */
  onlyFor?: string[];
  /** Pour une liste : valeurs proposées (on peut en saisir d'autres). */
  suggest?: string[];
  /** Pour une liste : propose les documents du projet. */
  suggestFrom?: 'doc';
  /** Propose les scripts du projet comme commandes à un clic. */
  suggestScripts?: boolean;
  /** Propose un bouton de suggestion par l'IA sous le champ. */
  ai?: boolean;
  /** Identifiant rempli automatiquement depuis ce champ (en minuscules, avec des tirets). */
  idFrom?: string;
  /** Identifiant rempli automatiquement avec ce préfixe et le numéro suivant (P-, F-, C-). */
  idAuto?: string;
}

/** Nom d'un script du dossier scripts/. */
export const SCRIPT_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,58}\.(sh|mjs|py)$/;
/** Commande qui lance un script du projet. */
export const scriptCommand = (name: string): string =>
  (name.endsWith('.mjs') ? 'node ' : name.endsWith('.py') ? 'python3 ' : 'bash ') + 'scripts/' + name;

export interface EntityDef {
  kind: EntityKind;
  label: string;
  dir: string;
  recursive?: boolean;
  fields: FieldDef[];
  body?: { label: string; ai?: boolean };
  /** Motif de l'identifiant (nom de fichier) quand il est saisi à la création. */
  idPattern?: RegExp;
  idHint?: string;
}

export type EntityKind = 'cycle' | 'feat' | 'pulse' | 'doc' | 'memory' | 'inbox' | 'background' | 'library' | 'workflow' | 'session';

const opts = (...pairs: [string, string][]): Opt[] => pairs.map(([value, label]) => ({ value, label }));
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;
const idHint = 'Lettres, chiffres, tirets. Sert de nom de fichier, non modifiable ensuite.';

export const DOC_TYPES = opts(['spec', 'Spec'], ['runbook', 'Runbook'], ['cookbook', 'Cookbook'], ['adr', 'Décision'], ['guide', 'Guide']);
export const DOC_DIRS: Record<string, string> = { spec: 'docs/specs', runbook: 'docs/runbooks', cookbook: 'docs/cookbooks', adr: 'docs/decisions', guide: 'docs' };
export const PURPOSES = ['Général', 'Sécurité', 'Migration', 'Simple', 'Docs', 'Tests', 'Revue'];
export const MODELS = ['Haiku 5.5', 'Sonnet 5.5', 'Opus 5.5', 'gpt-oss'];
/** Un modèle local (Ollama) se reconnaît à son étiquette de taille : `gpt-oss:20b`, `llama3.1:8b`… */
export const isLocalModel = (m: string) => m.includes(':');
export const TOOLS = ['Lecture', 'Édition', 'Commandes', 'Web'];
const idField = (extra: Partial<FieldDef>): FieldDef => ({ key: 'id', label: 'Nom du fichier', type: 'string', required: true, createOnly: true, hint: 'Rempli automatiquement. Ne pourra plus changer.', half: true, ...extra });

const linkFields: FieldDef[] = [
  { key: 'parent', label: 'Parent', type: 'ref', refKind: 'ticket', section: 'Liens', hint: 'Un autre ticket : cycle, feat, pulse ou ticket Jira.' },
  { key: 'docs', label: 'Documents liés', type: 'list', suggestFrom: 'doc', section: 'Liens' }
];

export const ENTITIES: Record<EntityKind, EntityDef> = {
  cycle: {
    kind: 'cycle', label: 'Cycle', dir: 'cycles', idPattern: ID, idHint,
    fields: [
      idField({ idAuto: 'C-' }),
      { key: 'title', label: 'Titre', type: 'string', required: true },
      { key: 'period', label: 'Période', type: 'string', half: true, hint: 'Par exemple 3 au 21 novembre' },
      { key: 'state', label: 'État', type: 'enum', half: true, options: opts(['À venir', 'À venir'], ['En cours', 'En cours'], ['Terminé', 'Terminé']) },
      ...linkFields
    ]
  },
  feat: {
    kind: 'feat', label: 'Feat', dir: 'feats', idPattern: ID, idHint,
    fields: [
      idField({ idAuto: 'F-' }),
      { key: 'title', label: 'Titre', type: 'string', required: true },
      { key: 'cycle', label: 'Cycle', type: 'ref', refKind: 'cycle', half: true },
      { key: 'goal', label: 'Résultat attendu', type: 'text', ai: true },
      { key: 'spec', label: 'Spec', type: 'ref', refKind: 'doc' },
      { key: 'budget', label: 'Budget (milliers de tokens)', type: 'number', half: true },
      ...linkFields
    ]
  },
  pulse: {
    kind: 'pulse', label: 'Pulse', dir: 'pulses', idPattern: ID, idHint,
    body: { label: 'Note', ai: true },
    fields: [
      idField({ idAuto: 'P-' }),
      { key: 'title', label: 'Titre', type: 'string', required: true },
      { key: 'feat', label: 'Feat', type: 'ref', refKind: 'feat', half: true },
      { key: 'workflow', label: 'Workflow', type: 'ref', refKind: 'workflow', half: true },
      { key: 'state', label: 'État', type: 'enum', half: true, options: opts(['todo', 'À faire'], ['plan', 'Plan à valider'], ['run', 'En cours'], ['wait', 'Attend ta validation'], ['done', 'Terminé']) },
      { key: 'session', label: 'Session', type: 'ref', refKind: 'session', half: true },
      ...linkFields
    ]
  },
  doc: {
    kind: 'doc', label: 'Document', dir: 'docs', recursive: true,
    body: { label: 'Contenu en markdown', ai: true },
    fields: [
      { key: 'title', label: 'Titre', type: 'string', required: true },
      { key: 'type', label: 'Type', type: 'enum', options: DOC_TYPES, freeText: true, required: true, half: true },
      { key: 'project', label: 'Projet', type: 'string', half: true },
      { key: 'updated', label: 'Mis à jour le', type: 'string', hint: 'AAAA-MM-JJ', half: true }
    ]
  },
  memory: {
    kind: 'memory', label: 'Entrée de mémoire', dir: 'memory',
    body: { label: 'Ce qu\'il faut retenir', ai: true },
    fields: [{ key: 'title', label: 'Titre', type: 'string', required: true }]
  },
  inbox: {
    kind: 'inbox', label: 'Demande', dir: 'inbox', idPattern: ID, idHint,
    fields: [
      idField({ idFrom: 'title' }),
      { key: 'kind', label: 'Type', type: 'enum', required: true, half: true, options: opts(['alert', 'Alerte'], ['valid', 'Validation'], ['plan', 'Plan'], ['memo', 'Mémoire'], ['doc', 'Documentation'], ['bg', 'Tâche de fond']) },
      { key: 'project', label: 'Projet', type: 'string', half: true },
      { key: 'title', label: 'Titre', type: 'string', required: true },
      { key: 'when', label: 'Quand', type: 'string', half: true },
      { key: 'detail', label: 'Détail', type: 'text', ai: true },
      { key: 'primary', label: 'Texte du bouton principal', type: 'string', half: true },
      { key: 'target', label: 'Ouvre', type: 'enum', half: true, options: opts(['', 'Rien'], ['developpement', 'Développement'], ['architecture', 'Architecture'], ['projet', 'Projet'], ['documentation', 'Documentation'], ['stats', 'Stats']) },
      { key: 'secondary', label: 'Texte du bouton secondaire', type: 'string', half: true }
    ]
  },
  background: {
    kind: 'background', label: 'Tâche de fond', dir: 'background', idPattern: ID, idHint,
    fields: [
      idField({ idFrom: 'name' }),
      { key: 'name', label: 'Nom', type: 'string', required: true },
      { key: 'what', label: 'Ce qu\'elle fait', type: 'text', ai: true },
      { key: 'trigger', label: 'Déclencheur', type: 'string', half: true, hint: 'Par exemple Chaque jour' },
      { key: 'type', label: 'Type', type: 'enum', half: true, options: opts(['script', 'Script'], ['agent', 'Agent'], ['both', 'Script puis agent']) },
      { key: 'command', label: 'Script à lancer', type: 'string', hint: 'Un script du dossier scripts/, par exemple bash scripts/audit.sh', ai: true },
      { key: 'prompt', label: "Consigne de l'agent", type: 'text', ai: true },
      { key: 'cost', label: 'Coût', type: 'string', half: true },
      { key: 'savedK', label: 'Économie par semaine (k tokens)', type: 'number', half: true },
      { key: 'launchable', label: 'Peut proposer un lancement', type: 'bool' },
      { key: 'active', label: 'Active', type: 'bool' }
    ]
  },
  library: {
    kind: 'library', label: 'Nœud de bibliothèque', dir: 'library', idPattern: ID, idHint,
    fields: [
      idField({ idFrom: 'label', section: 'Général' }),
      { key: 'label', label: 'Nom', type: 'string', required: true, section: 'Général', half: true },
      { key: 'type', label: 'Type', type: 'enum', options: opts(['agent', 'Agent'], ['script', 'Script']), section: 'Général', half: true },
      { key: 'purposes', label: 'Usages', type: 'list', suggest: PURPOSES, section: 'Général', hint: 'Sert à filtrer la bibliothèque et aide le planificateur à choisir.' },
      { key: 'model', label: 'Modèle', type: 'enum', options: MODELS.map((m) => ({ value: m, label: m })), section: 'Modèle', half: true, onlyFor: ['agent'] },
      { key: 'effort', label: 'Intensité', type: 'enum', options: opts(['Faible', 'Faible'], ['Moyen', 'Moyen'], ['Élevé', 'Élevé']), section: 'Modèle', half: true, onlyFor: ['agent'] },
      { key: 'fallback', label: 'Modèles de repli, dans l\'ordre', type: 'list', suggest: MODELS, section: 'Modèle', onlyFor: ['agent'], hint: 'Essayés quand le modèle principal échoue.' },
      { key: 'command', label: 'Commande', type: 'string', section: 'Commande', onlyFor: ['script'], ai: true, suggestScripts: true, hint: 'Par exemple npm run build' },
      { key: 'prompt', label: 'Consigne', type: 'text', section: 'Consigne et réussite', onlyFor: ['agent'], ai: true },
      { key: 'success', label: 'Critère de réussite', type: 'text', section: 'Consigne et réussite', ai: true },
      { key: 'tools', label: 'Outils autorisés', type: 'list', suggest: TOOLS, section: 'Outils et extensions', onlyFor: ['agent'] },
      { key: 'skills', label: 'Skills', type: 'list', section: 'Outils et extensions', onlyFor: ['agent'], hint: 'Tape un nom puis Entrée.' },
      { key: 'plugins', label: 'Plugins', type: 'list', section: 'Outils et extensions', onlyFor: ['agent'], hint: 'Tape un nom puis Entrée.' },
      { key: 'retries', label: 'Essais', type: 'number', section: 'Limites', half: true },
      { key: 'budget', label: 'Budget', type: 'string', section: 'Limites', half: true, onlyFor: ['agent'], hint: 'Par exemple 40k' },
      { key: 'cond', label: 'Condition', type: 'string', section: 'Limites', half: true, hint: 'Par exemple Toujours' },
      { key: 'isolated', label: 'Travailler sur une branche git isolée', type: 'bool', section: 'Limites', onlyFor: ['agent'] }
    ]
  },
  session: { kind: 'session', label: 'Session', dir: 'sessions', fields: [] },
  workflow: {
    kind: 'workflow', label: 'Workflow', dir: 'workflows', idPattern: ID, idHint,
    fields: [
      idField({ idFrom: 'name' }),
      { key: 'name', label: 'Nom', type: 'string', required: true },
      { key: 'when', label: 'Quand l\'utiliser', type: 'string', ai: true }
    ]
  }
};

/** Champs d'un nœud de workflow modifiables depuis l'inspecteur. */
export const NODE_FIELDS: FieldDef[] = ENTITIES.library.fields.filter((f) => f.key !== 'id' && f.key !== 'type');
