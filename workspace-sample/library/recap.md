---
type: "agent"
label: "Récap"
model: "llama3.1:8b"
effort: "Faible"
prompt: "Résume en cinq lignes ce qui a changé, le chemin pris et ce qui reste."
success: "Le récap est écrit dans sessions/."
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
