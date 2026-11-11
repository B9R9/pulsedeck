---
id: 2026-11-10-test-promptt
name: workspace-sample
branch: ''
status: done
pulse: ''
task: test promptt
tokens: '92'
elapsed: 4 s
ask: test promptt
actions: 0 action
workflow: Libre
confidence: 0
route: 'lancée à la main, sans routeur'
recapLabel: Récap
recapTitle: 'Le message est bien reçu, le test fonctionne.'
recapNote: 'Récap dans sessions/2026-11-10-test-promptt.md, écrit à la fin de la session'
decision: ''
primary: ''
secondary: ''
recap:
  - >-
    Pour la suite, on peut reprendre le workflow `feat` avec l'une des trois
    options proposées plus haut : lecture seule, exécution réelle (avec ton
    accord sur le script) ou variante. Si tu veux autre cho
nodes:
  - id: prompt
    c: 0
    l: 0
    state: done
    label: Ton prompt
    sub: test promptt
    meta: ''
  - id: agent
    c: 1
    l: 0
    state: done
    label: Agent libre
    sub: avec tes accords
    meta: 0 actions
  - id: recap
    c: 2
    l: 0
    state: done
    label: Récap
    sub: résumé final
    meta: ''
edges:
  - - prompt
    - agent
  - - agent
    - recap
claudeSessionId: d804dd93-b723-4b89-8b6e-03a35fd12bef
workflowVersion: ''
startedAt: '2026-11-10T11:47:51.053Z'
tokenCount: 92
durationMs: 3561
bricks: []
---
Le message est bien reçu. Votre test fonctionne.

Dites-moi ce que vous voulez faire sur le projet (par exemple une modification dans `workspace-sample/`, une vérification des types ou un nouveau workflow), et je m'en occupe.

## Suivi : je veux tester un worflowe different

Il y a 5 workflows dans `workflows/` :

- `feat.md`
- `fix.md`
- `review.md`
- `doc.md`
- `free.md`

Lequel veux-tu tester ? Dis-moi aussi ce que tu veux vérifier :

- **La lecture du fichier** : en-tête YAML, nœuds et liens.
- **L'exécution par le moteur** : ordre des étapes, essais, modèles de repli, arrêt sur « Ta validation ».
- **Un nouveau workflow** : à créer avec des étapes différentes.

Si tu choisis l'exécution, je te montrerai d'abord le contenu du workflow et j'attendrai ton accord avant de lancer quoi que ce soit.

## Suivi : feat

Voici le workflow **Feature standard** (`feat`), utilisé pour « ajout ou modification de fonctionnalité » :

| Étape | Type | Rôle |
|---|---|---|
| `plan` | bibliothèque | Point de départ |
| `codef`, `codeb`, `docs` | bibliothèque | Trois branches en parallèle après `plan` |
| `merge` | script | Lance `git merge --no-ff`, avec 1 essai de repli |
| `tests` | bibliothèque | Tests après la fusion |
| `verify` | bibliothèque | Attend `tests` et `docs` |
| `valid` | humain | Arrêt sur « Ta validation » |
| `recap` | bibliothèque | Récap final |
| `alert` | alerte | Message dans `inbox/` si `merge` ou `tests` échoue |

**Enchaînement** : `plan` → (`codef` + `codeb` + `docs`) → `merge` → `tests` → `verify` → `valid` → `recap`.

**À noter pour ton test :**
- `codeb` a un slot configuré : skills `testing-strategy` et `code-review`, doc `docs/cookbooks/route-auth.md`, agents `codeb` et `data`.
- `verify` n'a aucun lien d'échec. Si `verify` échoue, aucune alerte n'est prévue.
- Le `CLAUDE.md` du workspace impose un test pour chaque changement de code. Il interdit aussi de toucher à la production sans point d'arrêt « Ta validation ».

Je ne lance rien tant que tu n'as pas donné ton accord. Comment veux-tu le tester ?
1. **Lecture seule** : je vérifie la cohérence du fichier (identifiants, liens, entrées de la bibliothèque `libId`).
2. **Exécution réelle** : je te montre d'abord le script `git merge --no-ff` et tu valides.
3. **Variante** : je copie `feat` vers un nouveau workflow modifié, par exemple en ajoutant un lien d'échec sur `verify`.

## Suivi : tes sessions

Il y a une seule session dans `sessions/` : `2026-11-10-test-promptt.md`.

| Champ | Valeur |
|---|---|
| Tâche | « test promptt » |
| État | terminée |
| Workflow | Libre, lancée à la main, sans routeur |
| Début | 10 novembre 2026, 11:47 |
| Durée | 4 s |
| Jetons | 92 |
| Actions | 1 |
| Branche et pulse | aucun |

Le récap suit trois étapes : « Ton prompt », « Agent libre » puis « Récap ».

Le fichier contient aussi les échanges suivants de cette conversation :
1. Ton test initial, avec ma réponse.
2. Ta demande de tester un autre workflow, avec la liste des 5 workflows.
3. Ton choix de `feat`, avec le tableau des étapes et mes trois options de test.

Il y a une incohérence dans le récap. L'en-tête YAML affiche le titre « Feature standard » et le début du tableau, mais le champ `tokens` (92) et la durée (4 s) ne couvrent que le premier échange. Les suivis n'ont pas mis ces compteurs à jour.

Tu voulais peut-être autre chose par « tes sessions », par exemple les sessions d'un autre projet ou un format différent. Dis-moi si c'est le cas.

## Suivi : test

Le message est bien reçu, le test fonctionne.

Pour la suite, on peut reprendre le workflow `feat` avec l'une des trois options proposées plus haut : lecture seule, exécution réelle (avec ton accord sur le script) ou variante. Si tu veux autre chose, dis-moi quoi.
