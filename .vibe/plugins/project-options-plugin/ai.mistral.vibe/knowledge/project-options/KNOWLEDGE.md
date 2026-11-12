---
name: project-options
description: Configuration des options de projet, des modèles locaux par défaut et du choix de modèle pour projets, docs et nœuds.
display_name: Project Options
icon: settings
---

# Configuration des Options de Projet

Ce module couvre quatre besoins :

1. **Projet de travail** : choisir le projet actif dans les options.
2. **Modèles par défaut** : inclure les modèles locaux (Ollama, LM Studio, llama.cpp…) à côté des modèles cloud.
3. **Modèle par action** : pouvoir choisir le modèle utilisé pour les actions dans projets et docs.
4. **Modèles locaux pour les nœuds** : un modèle local peut également être sélectionné pour les nœuds.

## Stockage

Les choix sont persistés dans `.vibe/project-options.json` à la racine du projet :

```json
{
  "workingProject": "mon-projet",
  "defaultModels": {
    "cloud": ["mistral-large-latest", "mistral-medium-latest"],
    "local": ["ollama/llama3.1", "lmstudio/qwen2.5-coder"]
  },
  "actionModels": {
    "projets": "ollama/llama3.1",
    "docs": "mistral-medium-latest"
  },
  "nodeModel": "ollama/llama3.1"
}
```

## Règles

- Un modèle local est référencé par son préfixe de fournisseur (`ollama/`, `lmstudio/`, `llamacpp/`).
- Le modèle d'un nœud peut être local ou cloud, sans restriction.
- Si `actionModels` ne définit pas une action, le modèle par défaut de la session s'applique.
