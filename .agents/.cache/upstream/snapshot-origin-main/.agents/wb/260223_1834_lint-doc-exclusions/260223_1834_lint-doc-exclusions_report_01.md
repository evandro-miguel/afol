---
doc_type: report
id: 260223_1834_lint-doc-exclusions_report_01
theme: lint-doc-exclusions
status: final
created_at: '2026-02-23T15:35:41-03:00'
updated_at: '2026-02-23T16:12:49-03:00'
related_tasks:
- 260223_1834_lint-doc-exclusions_task_01
links:
  spec: 260223_1834_lint-doc-exclusions_spec-lite_01
---

# Report: lint-doc-exclusions

## Summary

- Lint scope now ignores instructional/orientation docs as requested.
- Result: `make lint` moved from noisy warnings to clean actionable output.

## Delivered Changes

- Added explicit exclusions in linter scan:
  - `a-docs/`
  - `arc/structure/`
  - `scripts/.agent/docs/`
  - `z-arq/`
- Added helper method `should_skip_file()` to centralize exclusion logic.
- Updated lessons with this user correction and prevention rule.

## Files Changed

- `.agents/scripts/agents-lint-docs.py`
- `.agents/a-docs/lessons/general-lessons.md`
- `.agents/wb/260223_1834_lint-doc-exclusions/260223_1834_lint-doc-exclusions_plan_01.md`
- `.agents/wb/260223_1834_lint-doc-exclusions/260223_1834_lint-doc-exclusions_task_01.md`
- `.agents/wb/260223_1834_lint-doc-exclusions/260223_1834_lint-doc-exclusions_spec-lite_01.md`
- `.agents/wb/260223_1834_lint-doc-exclusions/260223_1834_lint-doc-exclusions_log_01.md`
- `.agents/wb/260223_1834_lint-doc-exclusions/260223_1834_lint-doc-exclusions_report_01.md`

## Verification

- Lint: `make lint` -> pass -> `Files checked: 21`, `Issues found: 0`.
- Task validation: `make verify` -> pass -> all tasks completed/skipped as expected.
- Full workflow: `make all` -> pass (doctor + structure + index + verify).
- Syntax: `python3 -m py_compile .agents/scripts/agents-lint-docs.py` -> pass.

## Risks / Follow-ups

- Excluded docs are no longer linted by default; if strict doc lint is needed later, add an opt-in flag (e.g., `--include-docs`).

## Spec Evidence

- Spec ID: `260223_1834_lint-doc-exclusions_spec-lite_01`
- Evidence: verification commands above satisfy all spec done criteria.

---

*Template: `.agents/a-docs/templates/report.md`*
