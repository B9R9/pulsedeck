---
id: "free"
name: "Libre"
when: "Tout le reste, sans workflow"
nodes:
  - {"id": "free", "l": 1, "type": "agent", "label": "Agent libre", "model": "Sonnet 5.5", "effort": "Moyen", "prompt": "Aucun workflow : tu décides des étapes avec moi.", "success": "Tu valides le résultat.", "tools": ["Lecture", "Édition", "Commandes"], "purposes": [], "fallback": [], "retries": 1, "budget": "80k", "isolated": false, "skills": [], "plugins": [], "docs": [], "cond": "Toujours"}
  - {"id": "recap", "l": 1, "libId": "recap"}
edges:
  - ["free", "recap", "ok"]
---
