---
type: "agent"
label: "Code back"
model: "Sonnet 5.5"
effort: "Moyen"
prompt: "Implémente la partie serveur sur ta branche isolée, uniquement dans les fichiers prévus."
success: "Les fichiers prévus sont modifiés et compilent."
tools: ["Lecture", "Édition", "Commandes"]
purposes: ["Général"]
fallback: ["Opus 5.5"]
retries: 3
budget: "40k"
isolated: true
skills: []
plugins: ["engineering"]
docs: [{"path": "docs/cookbooks/route-auth.md", "role": "read"}]
cond: "Toujours"
---
