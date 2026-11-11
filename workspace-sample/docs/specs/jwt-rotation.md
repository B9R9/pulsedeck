---
title: Rotation des clés JWT
type: spec
project: afterlife-api
updated: "2026-11-08"
---
# Objectif

Remplacer la clé de signature des tokens toutes les 24 heures sans déconnecter les utilisateurs.

# Comportement

- Deux clés sont valides en même temps : l'active signe, la précédente vérifie encore pendant 15 minutes.
- La rotation est déclenchée par une tâche planifiée.

# Fichiers touchés

```
src/auth/keyring.ts
src/auth/rotate.ts
```

# Critère de fin

Un test d'intégration montre qu'un token signé avant la rotation reste accepté.
