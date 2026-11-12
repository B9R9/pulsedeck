---
name: project-options
description: Gérer le projet de travail, les modèles locaux par défaut et le choix de modèle pour projets, docs et nœuds.
user-invocable: true
---

# Gestion des Options de Projet

## Commandes

- `project-options:config` — afficher et modifier les options courantes.
- `project-options:set-project <nom>` — définir le projet de travail actif.
- `project-options:set-model <action> <modele>` — définir le modèle d'une action (`projets` ou `docs`).
- `project-options:set-node-model <modele>` — définir le modèle des nœuds (local accepté).

## Modèles

Les modèles locaux sont détectés automatiquement (Ollama sur `localhost:11434`, LM Studio sur `localhost:1234`) et proposés avec les modèles cloud dans les listes de sélection, préfixés par leur fournisseur.

## Exemples

```
project-options:set-project refonte-site
project-options:set-model docs ollama/llama3.1
project-options:set-node-model lmstudio/qwen2.5-coder
```

## Fichier de configuration

Les options vivent dans `.vibe/project-options.json` (voir la knowledge `project-options-plugin:project-options` pour le format complet).
