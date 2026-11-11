---
type: "agent"
label: "Vérification"
model: "Sonnet 5.5"
effort: "Moyen"
prompt: "Vérifie que les tests passent, puis relis le diff."
success: "Aucun problème bloquant dans le diff."
tools: ["Lecture", "Commandes"]
purposes: ["Revue"]
fallback: []
retries: 3
budget: "40k"
isolated: false
skills: ["code-review"]
plugins: []
docs: [{"path": "docs/runbooks/deploy-prod.md", "role": "read"}]
cond: "Toujours"
---
