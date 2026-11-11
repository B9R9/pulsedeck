---
id: "feat"
name: "Feature standard"
when: "Ajout ou modification de fonctionnalité"
nodes:
  - {"id": "plan", "l": 1, "libId": "plan"}
  - {"id": "codef", "l": 0, "libId": "codef"}
  - {"id": "codeb", "l": 1, "libId": "codeb", "slot": {"on": true, "skills": ["testing-strategy", "code-review"], "docs": ["docs/cookbooks/route-auth.md"], "agents": ["codeb", "data"]}}
  - {"id": "docs", "l": 2, "libId": "docs"}
  - {"id": "merge", "type": "script", "l": 0.5, "label": "Fusion", "command": "git merge --no-ff", "success": "Code de sortie 0.", "retries": 1, "cond": "Toujours"}
  - {"id": "tests", "l": 0.5, "libId": "tests"}
  - {"id": "verify", "l": 1, "libId": "verify"}
  - {"id": "valid", "type": "human", "l": 1, "label": "Ta validation"}
  - {"id": "recap", "l": 1, "libId": "recap"}
  - {"id": "alert", "type": "alert", "l": 3, "label": "Alerte pour toi"}
edges:
  - ["plan", "codef", "ok"]
  - ["plan", "codeb", "ok"]
  - ["plan", "docs", "ok"]
  - ["codef", "merge", "ok"]
  - ["codeb", "merge", "ok"]
  - ["merge", "tests", "ok"]
  - ["tests", "verify", "ok"]
  - ["docs", "verify", "ok"]
  - ["verify", "valid", "ok"]
  - ["valid", "recap", "ok"]
  - ["merge", "alert", "fail"]
  - ["tests", "alert", "fail"]
---
