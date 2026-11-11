---
type: "agent"
label: "Planificateur"
model: "Opus 5.5"
effort: "Élevé"
prompt: "Découpe la demande en branches, répartis les fichiers entre les agents de code et estime le coût de chacune."
success: "Chaque branche a un objectif, ses fichiers et un critère de fin."
tools: ["Lecture", "Recherche"]
purposes: ["Général"]
fallback: ["Sonnet 5.5"]
retries: 2
budget: "40k"
isolated: false
skills: []
plugins: []
docs: [{"path": "docs/specs/jwt-rotation.md", "role": "read"}]
cond: "Toujours"
---
