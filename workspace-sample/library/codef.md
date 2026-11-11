---
type: "agent"
label: "Code front"
model: "Sonnet 5.5"
effort: "Moyen"
prompt: "Implémente la partie interface sur ta branche isolée, uniquement dans les fichiers prévus."
success: "Les fichiers prévus sont modifiés et compilent."
tools: ["Lecture", "Édition", "Commandes"]
purposes: ["Général"]
fallback: []
retries: 3
budget: "40k"
isolated: true
skills: ["frontend-design"]
plugins: ["design"]
docs: []
cond: "Toujours"
---
