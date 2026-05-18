---
doc_type: lesson_entry
id: lesson_20260509_1804_done-state-ledger-gate
status: active
created_at: '2026-05-09T18:04:52-03:00'
updated_at: '2026-05-09T18:04:52-03:00'
source: user_correction
related_session: 260509_1750_done-state-hardening
---

# Lesson: Done State Requires Ledger-Backed Closure

## Correction

The user identified a recurring failure across projects: agents create or update
tasks as `done` before executing the work, sometimes by writing a completed
state directly into the task document or by relying on generic narrative
evidence.

## What Went Wrong

- Task state could be changed in markdown without a hard link to a specific
  ledger evidence record.
- Strict verification accepted task-file text that looked like evidence instead
  of requiring task-scoped `.evidence.jsonl` closure evidence.
- Agent-facing examples normalized `mark-done` as a simple action instead of a
  gated closure operation.

## Prevention Rule

Never create a new task as `done`. A task may enter `done` only after:

1. The requested execution work has actually been completed.
2. A task-scoped `.evidence.jsonl` record exists with a concrete command, a
   passing or explicitly not-applicable result, and an artifact path or note.
3. The task state is changed through `wb-update task --mark-done --evidence-id
   E-...`.
4. `verify-tasks --strict` accepts the linked closure evidence and finds no
   unresolved blocking failures for that task.

## Guardrail

Completion commands must reject generic closure labels such as `done`,
`complete`, or `implementation` as evidence commands. Generic summaries belong
in reports; they are not closure gates.

If validation is not applicable, record that as explicit evidence with `result:
N/A` or an equivalent note before moving the task to `done`.

