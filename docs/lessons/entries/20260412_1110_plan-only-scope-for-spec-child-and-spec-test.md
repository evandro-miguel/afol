---
doc_type: lesson_entry
id: lesson_20260412_1110_plan_only_scope_for_spec_child_and_spec_test
status: active
created_at: '2026-04-12T11:10:00-03:00'
updated_at: '2026-04-12T11:14:57-03:00'
source: user_correction
related_workstream_id: 260411_2214_agentic-runtime-restructure
---

# Lesson: Plan-Only Scope For `spec-child` And `spec-test`

## Correction

The user asked to add the `spec-lite` -> `spec-child` refactor and the new
`spec-test` strategy artifact to the plan, not to start implementation
immediately.

## Prevention Rule

- When the user says to add an item to the plan, update roadmap/spec/plan
  artifacts first and stop before editing scripts, templates, tests, or command
  behavior.
- Treat "create roadmap/spec" as allowed planning work, not as permission to
  implement the feature.

## Guardrail

- For this request, do not modify `agents-new.py`, workbench templates,
  validation scripts, or tests for `spec-child` / `spec-test` until a separate
  F-14 implementation workstream is explicitly started.
