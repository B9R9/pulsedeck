---
type: "agent"
label: "Code données"
model: "Sonnet 5.5"
effort: "Moyen"
prompt: "Écris les migrations et les requêtes."
success: "Les migrations s'appliquent sur la base de test."
tools: ["Lecture", "Édition", "Commandes"]
purposes: ["Migration"]
fallback: ["Opus 5.5"]
retries: 3
budget: "40k"
isolated: true
skills: []
plugins: []
docs: []
cond: "Toujours"
---
