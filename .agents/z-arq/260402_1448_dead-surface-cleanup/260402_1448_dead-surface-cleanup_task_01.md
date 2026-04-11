---
doc_type: task
id: 260402_1448_dead-surface-cleanup_task_01
theme: dead-surface-cleanup
status: done
owners:
- worker
- tester
created_at: '2026-04-02T14:48:32-03:00'
updated_at: '2026-04-02T15:01:53-03:00'
roadmap_feature: F-11
parent_spec: 260323_1741_current-state-maps-and-goal-state-governance_spec_01
child_spec: ''
depends_on:
- 260402_1448_dead-surface-cleanup_plan_01
links:
  plan: 260402_1448_dead-surface-cleanup_plan_01
  roadmap: .agents/arc/GENERAL-ROADMAP.md
---

# Tasks: dead-surface-cleanup

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | worker | Map and confirm high-confidence dead surfaces |
| T-02 | done | worker | Remove dead files and align local docs |
| T-03 | done | tester | Rebuild generated structure docs and run repo validation |

**State values:** `pending` | `in_progress` | `ready_for_test` | `testing` | `done` | `blocked`

**Task ID format:** `T-01`, `T-02`, ... (ou `T-001` para boards grandes)

**State marker rules:** See [../standards/checkbox-protocol.md](../standards/checkbox-protocol.md)

## Governance Context
- Roadmap feature: `F-11`
- Parent spec: `260323_1741_current-state-maps-and-goal-state-governance_spec_01`
- Child spec: ``
- Task rule:
  - Tasks execute approved intent; they do not replace roadmap/spec definition.

## Relevant Lessons

Before starting work, consult relevant resources:

### Prevention Rules
- Reviewed `AGENTS.md` cleanup and validation rules.
- Reviewed relevant lesson history before deleting the old migration script.

### Useful Resources
- Rules useful for this task:
  - `AGENTS.md`
- Docs useful for this task:
  - `.agents/scripts/tests/TEST_STRATEGY.md`
- Skills useful for this task:
  - `refactor-simplification`
- Integrations useful for this task:
  - none

## Implementation Checkpoint
- Files touched:
  - `.agents/scripts/agents-bootstrap.py`
  - `.agents/scripts/tests/TEST_STRATEGY.md`
  - `.agents/scripts/tests/conftest.py`
  - `.agents/arc/structure/`
  - `README.md`
- Key decisions:
  - Delete only high-confidence dead surfaces.
  - Keep medium-risk compatibility-cache candidates for a separate pass.

## Test Gate
- Move to `ready_for_test` only after implementation checkpoint.
- Record command, result, and evidence before marking done.

### Test Evidence
- Command: `make all`
- Result: pass
- Evidence: `154 passed in 4.12s` and final banner `✓ All validations passed`

---
*Template: `.agents/a-docs/templates/task.md`*
