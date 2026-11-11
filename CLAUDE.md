# Claude UI

Application de bureau (Electron + Quasar + Vue 3 + TypeScript) pour piloter Claude Code avec une interface graphique.
La maquette de référence est l'artifact « Maquette interface Claude Code » (un fichier par mode).

## Règles
- Interface et textes en français. Pas de tirets longs dans les textes affichés.
- Thème sombre, tokens CSS dans `src/css/app.scss`.
- Ne jamais nommer une classe comme une classe utilitaire de Quasar : `xs`, `sm`, `md`, `lg`, `xl` (masquées selon la largeur), `row`, `col`, `column`, `wrap`, `hidden`. Utiliser par exemple `small`, `mdtext`, `stack`.
- Dans un composant, ne pas donner à un bloc de mise en page le nom d'une variante globale (`main`, `ok`, `danger`, `sel` sur un `select`) : le style déteint sur les boutons `.btn`.
- La remise à zéro des boutons dans un style scoped s'écrit `:where(button:not(.btn, .chipb)) { … }` pour ne pas écraser `.btn`.
- Boutons modifier et supprimer : icônes `.icons` / `.ic` (globales), avec `aria-label`.
- Le dépôt du projet piloté est la source de vérité : Feats, Pulses, Cycles, docs, récaps et mémoire sont des fichiers markdown avec un en-tête YAML.
- Le processus principal d'Electron (`src-electron/`) lit et écrit les fichiers et, plus tard, pilote Claude Code. L'interface Vue ne touche jamais au disque : elle passe par `window.api` (voir `src/shared/types.ts`).
- Un agent ne se lance jamais seul : toute demande passe par « À traiter » et attend un accord. Dans une session, Claude lit librement ; chaque modification, commande ou script demande ton accord dans le volet.
- Le moteur de workflow (`src-electron/workflow-engine.ts`) exécute les étapes dans l'ordre des liens (ok, échec, bloqué), avec essais, modèles de repli, alerte dans `inbox/` et arrêt sur « Ta validation ».

## Commandes
- `npm install` puis `npm run dev` : lance l'app dans Electron.
- `npm run dev:web` : lance seulement l'interface dans le navigateur (sans accès aux fichiers).
- `npm run typecheck` : vérifie les types.

## Structure
- `src-electron/` : processus principal, preload, lecture du projet.
- `src/pages/` : une page par mode (Développement, Architecture, Projet, Documentation, À traiter, Stats).
- `workspace-sample/` : projet d'exemple pour développer sans toucher à un vrai dépôt.

## Formats des fichiers du projet
- `cycles/C-n.md` : id, title, period, state.
- `feats/F-n.md` : id, title, cycle, goal, spec (chemin d'un doc), budget (en milliers de tokens).
- `pulses/P-n.md` : id, title, feat, workflow, state (todo, plan, run, wait, done), session.
- `workflows/*.md` : id, name, when, nodes (id, c = colonne, l = ligne par pas de 0,5, libId ou champs propres), edges ([de, vers, ok|fail|blocked]). Les anciens nœuds sans `c` reçoivent leur colonne au premier ajout ou déplacement.
- `docs/**/*.md` : title, type (cookbook, runbook, spec, adr, guide), project, updated.
- `sessions/*.md` : récap d'une session. `memory/*.md` : mémoire du projet.
- `scripts/*.sh|mjs|py` : vrais fichiers exécutables, un niveau. Une étape de workflow de type script les lance par une commande (`bash scripts/nom.sh`) ; le lancement montre le contenu et demande l'accord.
