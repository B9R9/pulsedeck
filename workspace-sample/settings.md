---
router: "Haiku 5.5"
confirm: "always"
noMatch: "plan"
bgCap: 50
samples: [{"text": "Ajoute l'export du coffre en PDF", "wf": "Feature standard", "conf": 94, "picks": [["Général", "codeb"], ["Docs", "docs"], ["Tests", "tests"], ["Simple", "recap"]]}, {"text": "Le login renvoie une erreur 500 quand le mot de passe est vide", "wf": "Correctif rapide", "conf": 91, "picks": [["Général", "fixc"], ["Tests", "tests"], ["Simple", "recap"]]}, {"text": "Regarde la PR 43", "wf": "Revue de PR", "conf": 97, "picks": [["Revue", "analyse"], ["Sécurité", "secu"], ["Revue", "synth"]]}, {"text": "Réfléchis à l'architecture de la messagerie interne", "wf": "Libre", "conf": 62, "picks": [["Général", "plan"], ["Simple", "recap"]]}, {"text": "Ajoute une colonne expires_at à la table sessions", "wf": "Feature standard", "conf": 89, "picks": [["Migration", "migr"], ["Sécurité", "secu"], ["Tests", "tests"], ["Simple", "simple"]]}]
candidates: [{"id": "c1", "text": "Vérification relance les mêmes deux commandes dans 9 sessions sur 10. Un script ferait pareil sans tokens.", "savedK": 6}, {"id": "c2", "text": "Le récap du matin copie les mêmes champs du dernier Pulse. Un gabarit remplirait 80 % du texte.", "savedK": 4}]
---
