---
type: "agent"
label: "Tâche simple"
model: "llama3.1:8b"
effort: "Faible"
prompt: "Fais la tâche courte demandée, sans modifier de code."
success: "Le résultat est produit."
tools: ["Lecture"]
purposes: ["Simple"]
fallback: ["Haiku 5.5"]
retries: 2
budget: "20k"
isolated: false
skills: []
plugins: []
docs: []
cond: "Toujours"
---
