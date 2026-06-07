---
doc_type: lesson_entry
id: lesson_20260224_1832_enforce-rules-with-executable-gates
status: active
created_at: '2026-02-24T18:32:00-03:00'
updated_at: '2026-02-24T18:32:00-03:00'
source: user_correction
related_session: 260224_1253_execution-integrity-hardening
---

# Lesson: Rules Must Be Enforced by Executable Gates

## Correction

User reported agents were not following repository rules consistently.

Root cause: instruction-only governance allowed agents to mark execution complete while artifacts still had objective inconsistencies.

## Prevention Rule

Do not treat policy text as sufficient control.
Every critical rule must have a deterministic automated check that can fail execution.

## Guardrails Added

- Strict verification now fails on future timestamps in frontmatter.
- Strict verification now fails when latest plan links a task that does not reference that plan.
- Strict verification now fails when `status: final` docs still contain open checklist markers.

## Operational Standard

Before accepting agent execution as complete, run:

```bash
./.agents/agents verify-tasks .afol/wb/<session> --strict
```

Completion is valid only when strict mode passes with zero errors.
