---
doc_type: task
id: 260323_1753_execplan-native-planning-system_task_01
theme: execplan-native-planning-system
status: active
owners:
- worker
- tester
created_at: '2026-03-23T17:53:45-03:00'
updated_at: '2026-03-23T18:05:33-03:00'
roadmap_feature: F-12
parent_spec: 260323_1815_execplan-native-planning-system_spec_01
child_spec: ''
depends_on:
- 260323_1753_execplan-native-planning-system_plan_01
links:
  plan: 260323_1753_execplan-native-planning-system_plan_01
  roadmap: .agents/arc/GENERAL-ROADMAP.md
---

# Tasks: execplan-native-planning-system

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | orchestrator | Added `PLANS.md`, upgraded the plan template and verifier, updated bootstrap/docs, and validated the session end to end. |

**State values:** `pending` | `in_progress` | `ready_for_test` | `testing` | `done` | `blocked`

**Task ID format:** `T-01`, `T-02`, ... (ou `T-001` para boards grandes)

**State marker rules:** See [../standards/checkbox-protocol.md](../standards/checkbox-protocol.md)

## Governance Context
- Roadmap feature: `F-12`
- Parent spec: `260323_1815_execplan-native-planning-system_spec_01`
- Child spec: ``
- Task rule:
  - Tasks execute approved intent; they do not replace roadmap/spec definition.

## Relevant Lessons

Before starting work, consult relevant resources:

### Prevention Rules
  - [x] Check [../lessons/general-lessons.md](../lessons/general-lessons.md)
  - [x] Check lesson entries in [../lessons/entries/](../lessons/entries/)

### Useful Resources
- Rules useful for this task:
  - [x] Planning gates should be enforced by executable checks when possible.
- Docs useful for this task:
  - [x] `PLANS.md`
  - [x] `.agents/a-docs/templates/plan.md`
  - [x] `.agents/a-docs/standards/workflow.md`
- Skills useful for this task:
  - [x] `projects-workflow`
- Integrations useful for this task:
  - [x] OpenAI developer docs

## Implementation Checkpoint
- Files touched:
  - `PLANS.md`
  - `AGENTS.md`
  - `.agents/a-docs/templates/plan.md`
  - `.agents/scripts/verify-tasks.py`
  - `.agents/scripts/tests/test_verify_tasks_strict.py`
  - `.agents/scripts/agents-bootstrap.py`
- Key decisions:
  - Keep workbench plans canonical and adapt ExecPlan rules into that system instead of creating a second plan workflow.

## Test Gate
- Move to `ready_for_test` only after implementation checkpoint.
- Record command, result, and evidence before marking done.

### Test Evidence
- Command: `./.agents/scripts/.venv/bin/pytest .agents/scripts/tests/test_verify_tasks_strict.py -q`
- Result: pass
- Evidence: `26 passed`
- Additional evidence:
  - `./.agents/scripts/.venv/bin/pytest .agents/scripts/tests/test_runtime_compatibility.py -q` -> `14 passed`
  - `make lint-scripts` -> passed
  - `make lint` -> passed
  - `./.agents/agents sync --force` -> passed
  - `make all` -> passed
  - `./.agents/scripts/.venv/bin/python .agents/scripts/verify-tasks.py --strict .agents/wb/260323_1753_execplan-native-planning-system` -> passed

---
*Template: `.agents/a-docs/templates/task.md`*
