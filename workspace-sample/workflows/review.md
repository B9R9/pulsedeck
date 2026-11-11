---
id: "review"
name: "Revue de PR"
when: "Lien ou numéro de pull request"
nodes:
  - {"id": "fetch", "type": "script", "l": 1, "label": "Récupérer la PR", "command": "gh pr diff", "success": "Code de sortie 0.", "retries": 1, "cond": "Toujours"}
  - {"id": "analyse", "l": 0, "libId": "analyse"}
  - {"id": "secu", "l": 2, "libId": "secu"}
  - {"id": "synth", "l": 1, "libId": "synth"}
  - {"id": "valid", "type": "human", "l": 1, "label": "Ta validation"}
  - {"id": "post", "type": "script", "l": 1, "label": "Publier", "command": "gh pr review", "success": "Code de sortie 0.", "retries": 1, "cond": "Toujours"}
  - {"id": "alert", "type": "alert", "l": 3, "label": "Alerte pour toi"}
edges:
  - ["fetch", "analyse", "ok"]
  - ["fetch", "secu", "ok"]
  - ["analyse", "synth", "ok"]
  - ["secu", "synth", "ok"]
  - ["synth", "valid", "ok"]
  - ["valid", "post", "ok"]
  - ["fetch", "alert", "fail"]
---
