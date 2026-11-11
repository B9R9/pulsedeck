---
type: "agent"
label: "Tests"
model: "Sonnet 5.5"
effort: "Moyen"
prompt: "Écris et lance les tests sur le résultat fusionné, puis corrige jusqu'à ce qu'ils passent."
success: "Tous les tests passent."
tools: ["Lecture", "Édition", "Commandes"]
purposes: ["Tests"]
fallback: []
retries: 3
budget: "40k"
isolated: false
skills: []
plugins: []
docs: []
cond: "Toujours"
---
