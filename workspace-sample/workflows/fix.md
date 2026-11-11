---
id: fix
name: Correctif rapide
when: 'Bug précis, avec un message d''erreur'
nodes:
  - id: repro
    l: 1
    libId: repro
  - id: fixc
    l: 1
    libId: fixc
  - id: tst
    type: script
    l: 1
    label: Tests
    command: npm test
    success: Code de sortie 0.
    retries: 1
    cond: Toujours
  - id: valid
    type: human
    l: 1
    label: Ta validation
  - id: recap
    l: 1
    libId: recap
  - id: alert
    type: alert
    l: 2
    label: Alerte pour toi
  - id: n1
    l: 1
    type: agent
    label: Nouvel agent
    model: Sonnet 5.5
    effort: Moyen
    tools:
      - Lecture
    prompt: Décris ici ce que cet agent doit faire.
    success: Il déclare avoir terminé et le résultat est vérifiable.
    retries: 3
    budget: 40k
    cond: Toujours
    isolated: false
edges:
  - - repro
    - fixc
    - ok
  - - repro
    - alert
    - blocked
  - - tst
    - valid
    - ok
  - - tst
    - alert
    - fail
  - - valid
    - recap
    - ok
  - - fixc
    - n1
    - ok
  - - n1
    - tst
    - ok
---

