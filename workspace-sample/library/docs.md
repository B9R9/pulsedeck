---
type: "agent"
label: "Docs"
model: "Sonnet 5.5"
effort: "Moyen"
prompt: "Mets à jour la documentation touchée par le changement."
success: "Les fichiers de docs concernés sont à jour."
tools: ["Lecture", "Édition"]
purposes: ["Docs", "Simple"]
fallback: ["Haiku 5.5"]
retries: 2
budget: "40k"
isolated: false
skills: []
plugins: []
docs: [{"path": "docs/runbooks/deploy-prod.md", "role": "write"}]
cond: "Toujours"
---
