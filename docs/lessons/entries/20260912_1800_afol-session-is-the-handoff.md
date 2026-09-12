---
doc_type: lesson_entry
id: 20260912_1800_afol-session-is-the-handoff
status: active
created_at: '2026-09-12T18:00:00Z'
updated_at: '2026-09-12T18:00:00Z'
source: user_correction
tags:
- process
- afol
- delegation
---

# 2026-09-12 - AFOL session is the handoff

## Context

Delegated Grok work was routinely given a sidecar `.tmp/grok-handoff-*.md` even
when a governed AFOL session already held plan, tasks, and done-when. The user
corrected that this duplicates AFOL and is a project error.

## Lesson

AFOL is the handoff system. Session plan/task/log carry objective, scope, and
acceptance. Children read those artifacts. A harness pack is not a second
workbench.

## Prevention Rule

- Do not write `.tmp/grok-handoff-*.md` (or similar) by default.
- Point delegated agents at `-S <session>` and the task file.
- Write a sidecar pack only when the user asked, or AFOL cannot hold the
  context.

## Guardrail

RULE-002 Artifact Economy: no harness handoff packs when AFOL can carry the
context.
