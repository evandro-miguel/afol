---
doc_type: spec-lite
id: 260223_1855_task-id-standardization_spec-lite_01
theme: task-id-standardization
status: final
owners:
- orchestrator
created_at: '2026-02-23T15:55:42-03:00'
updated_at: '2026-02-23T18:00:21-03:00'
links:
  tasks: 260223_1855_task-id-standardization_task_01
  plan: 260223_1855_task-id-standardization_plan_01
  report: 260223_1855_task-id-standardization_report_01
risk_level: low
---

# SPEC LITE: task-id-standardization

## Objective

- Enforce task IDs in checklist lines and improve verification traceability (ID, file, line).

## Change Summary

- `verify-tasks.py` now parses only ID-based checklist tasks.
- Verification output shows open tasks with location.
- Task template documents canonical ID format.
- `agents-new.py` now enforces one active session (`.agents/wb/.active_session`) and supports `--quick` mode.
- `agents-wb-update.py` automates `updated_at` and `## Files Changed` updates.

## Files and Areas

- `.agents/scripts/verify-tasks.py`
- `.agents/scripts/agents-new.py`
- `.agents/scripts/agents-wb-update.py`
- `.agents/scripts/README.md`
- `.agents/a-docs/templates/task.md`
- `.agents/a-docs/standards/agents-usage.md`
- `.agents/a-docs/standards/Makefile`
- `.agents/a-docs/standards/scripts-reference.md`
- `AGENTS.md`

## Risks

- Legacy task lines without IDs are ignored by parser -> mitigated by template + standards update.
- New session creation is stricter by default -> mitigated with `--quick` and explicit `--force-new` path.

## Verification

- Commands:
  - `python3 -m py_compile .agents/scripts/verify-tasks.py`
  - `python3 -m py_compile .agents/scripts/agents-new.py`
  - `python3 -m py_compile .agents/scripts/agents-wb-update.py`
  - `make quick THEME=tiny-adjustment`
  - `make wb-touch`
  - `make wb-files-changed`
  - `make verify`
  - `make lint`
  - `make all`
- Evidence:
  - Captured in `260223_1855_task-id-standardization_report_01`.

## Done When

- [x] Verified with commands
- [x] No regressions observed
- [x] Report updated with evidence

---

*Template: `.agents/a-docs/templates/spec-lite.md`*
