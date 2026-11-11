---
title: Ajouter une route authentifiée
type: cookbook
project: afterlife-api
updated: "2026-11-06"
---
# Recette

Déclarer la route dans le routeur, puis passer par le middleware requireAuth.

```
router.get('/documents', requireAuth, list)
```

# À ne pas oublier

Ajouter le cas non authentifié dans auth.spec.ts.
