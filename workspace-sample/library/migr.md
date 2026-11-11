---
type: "agent"
label: "Migration sûre"
model: "Opus 5.5"
effort: "Élevé"
prompt: "Écris la migration, son retour arrière, et applique-la sur la base de test uniquement."
success: "La migration passe sur la base de test et son retour arrière aussi."
tools: ["Lecture", "Édition", "Commandes"]
purposes: ["Migration", "Sécurité"]
fallback: ["Sonnet 5.5"]
retries: 2
budget: "40k"
isolated: true
skills: []
plugins: []
docs: []
cond: "Toujours"
---
