---
doc_type: lesson_entry
id: 20260726_1210_gh-auth-and-git-ssh-are-separate-transports
status: active
created_at: '2026-07-26T12:10:00-03:00'
updated_at: '2026-07-26T12:10:00-03:00'
source: user_correction
tags:
  - git
  - github
  - authentication
---

# Lesson: GitHub CLI auth and Git SSH are separate transports

## Correction

A failed `gh` authentication path was treated as if it also blocked an already
authorized Git push, even though the repository remote used Git over SSH.

## Prevention Rule

- Distinguish GitHub CLI/API authentication from the Git remote transport.
- When a push is already authorized and `gh` fails, inspect the configured
  remote and test the applicable Git SSH path instead of assuming both
  authentication channels failed.
- Use the successful authorized transport only for the original scoped action;
  do not treat transport availability as broader permission.

## Guardrail

Before reporting an authorized push as blocked, check `git remote -v` and run a
non-destructive Git remote check over the configured transport.
