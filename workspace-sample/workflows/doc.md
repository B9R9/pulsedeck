---
id: doc
name: Mise à jour de doc
when: 'Lancé par une tâche de fond, après ta confirmation'
nodes:
  - id: docs
    l: 1
    libId: docs
    c: 0
  - id: valid
    type: human
    l: 0
    label: Ta validation
    c: 1
  - id: recap
    l: 0
    libId: recap
    c: 3
  - id: alert
    type: alert
    l: 3.5
    label: Alerte pour toi
    c: 1
  - id: analyse
    c: 2
    l: 2
    libId: analyse
  - id: codeb
    c: 3
    l: 3
    libId: codeb
edges:
  - - docs
    - valid
    - ok
  - - docs
    - alert
    - fail
  - - valid
    - recap
    - ok
  - - docs
    - analyse
    - ok
  - - analyse
    - recap
    - ok
  - - recap
    - analyse
    - ok
  - - codeb
    - analyse
    - ok
  - - codeb
    - alert
    - fail
  - - codeb
    - docs
    - ok
---

