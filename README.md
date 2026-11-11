# Claude UI

Interface de bureau pour piloter Claude Code. Voir `CLAUDE.md` pour les conventions.

## Démarrer
```
npm install
npm run dev
```
Au premier lancement en développement, l'app ouvre `workspace-sample/`. Le bouton « Choisir le dossier du projet » permet d'ouvrir un autre dépôt.

## État
- Fait : coquille Electron, navigation entre les modes, pages Projet et Documentation lues depuis de vrais fichiers markdown.
- À porter depuis la maquette : Développement, Architecture, À traiter, Stats.
- À brancher : sessions Claude Code réelles (Agent SDK), Ollama, Google Drive.
