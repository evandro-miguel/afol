---
doc_type: lesson_entry
id: 20260729_a00_submission_is_f31_not_evolution_child
status: active
created_at: '2026-07-29T00:00:00-03:00'
updated_at: '2026-07-29T00:00:00-03:00'
tags: [governance, roadmap, f-30, f-31, submission, evolution, adr-007]
---

# Submission Is F-31, Not an Evolution Child

## Context

Agent Submission was recorded as an F-30 Evolution child while Evolution already
owned F-30 and ADR-008. A prior lesson preferred the inverse (Submission as
F-30, Evolution as F-31). Renumbering shipped Evolution would have been
destructive and would fight parallel stacks.

## Decision recorded in A0.0

- **F-30** remains AFOL Evolution System (ADR-008).
- **F-31** is Agent Submission, Review, and Integration (ADR-007 accepted).
- Submission is no longer a child of the Evolution parent spec.
- Do not invent a second F-30 for orchestration.

## Prevention

- Allocate roadmap feature ids on `dev` before parallel agents implement.
- Never parent an orchestration/runtime lane under Evolution solely because
  both involve agents.
- Prefer a new F-id over renumbering a feature that already has implementation
  evidence, unless the user explicitly orders a renumber migration.
