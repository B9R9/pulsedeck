---
title: Déployer en production
type: runbook
project: afterlife-api
updated: "2026-10-09"
---
# Avant

Les tests passent, la migration est relue, aucun incident ouvert.

# Étapes

```
git tag v1.x
git push --tags
```

# Retour arrière

Redéployer le tag précédent depuis Render, puis annuler la migration.
