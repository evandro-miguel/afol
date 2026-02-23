---
doc_type: spec-lite
id: 260223_1834_lint-doc-exclusions_spec-lite_01
theme: lint-doc-exclusions
status: final
owners:
- orchestrator
created_at: '2026-02-23T15:34:09-03:00'
updated_at: '2026-02-23T16:12:49-03:00'
links:
  tasks: 260223_1834_lint-doc-exclusions_task_01
  plan: 260223_1834_lint-doc-exclusions_plan_01
  report: 260223_1834_lint-doc-exclusions_report_01
risk_level: low
---

# SPEC LITE: lint-doc-exclusions

## Objective
- Reduce lint noise by ignoring docs meant to teach/guide tool usage.

## Change Summary
- Add explicit path exclusions in lint scan for `a-docs` and orientation/generated docs.

## Files and Areas
- `.agents/scripts/agents-lint-docs.py`
- `.agents/a-docs/lessons/general-lessons.md`

## Risks
- Exclusions may hide useful checks in docs -> limited to user-requested areas only.

## Verification
- Commands:
  - `make lint`
  - `make verify`
  - `make all`
- Evidence:
  - Captured in `260223_1834_lint-doc-exclusions_report_01`.

## Done When
- [x] Verified with commands
- [x] No regressions observed
- [x] Report updated with evidence

---
*Template: `.agents/a-docs/templates/spec-lite.md`*
