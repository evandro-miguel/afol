---
doc_type: task
id: 260306_2240_session-close-command_task_01
theme: session-close-command
status: active
owners:
- worker
- tester
created_at: '2026-03-06T22:40:43-03:00'
updated_at: '2026-03-07T18:41:21-03:00'
roadmap_feature: F-08
parent_spec: 260306_context-driven-execution-commands_spec_01
child_spec: ''
depends_on:
- 260306_2240_session-close-command_plan_01
links:
  plan: 260306_2240_session-close-command_plan_01
  roadmap: .agents/arc/GENERAL-ROADMAP.md
---

# Tasks: session-close-command

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | worker | Implemented `agents-session.py`, wrapper wiring, and docs/catalog updates |
| T-02 | done | tester | Added focused unit coverage and completed targeted validation |
| T-03 | done | worker | Finalized the session artifacts and prepared governed closure |

**State values:** `pending` | `in_progress` | `ready_for_test` | `testing` | `done` | `blocked`

**Task ID format:** `T-01`, `T-02`, ... (ou `T-001` para boards grandes)

**State marker rules:** See [../standards/checkbox-protocol.md](../standards/checkbox-protocol.md)

## Governance Context
- Roadmap feature: `F-08`
- Parent spec: `260306_context-driven-execution-commands_spec_01`
- Child spec: ``
- Task rule:
  - Tasks execute approved intent; they do not replace roadmap/spec definition.

## Relevant Lessons

Before starting work, consult relevant resources:

### Prevention Rules
- [ ] Check [../lessons/general-lessons.md](../lessons/general-lessons.md)
- [ ] Check lesson entries in [../lessons/entries/](../lessons/entries/)

### Useful Resources
- Rules useful for this task:
  - [x] `AGENTS.md`
- Docs useful for this task:
  - [x] `.agents/a-docs/standards/agents-usage.md`
  - [x] `.agents/a-docs/standards/scripts-usage.md`
- Skills useful for this task:
  - [x] `agentic-system-workflow`
- Integrations useful for this task:
  - [x] `verify-tasks.py`

## Implementation Checkpoint
- Files touched:
  - `.agents/agents`
  - `.agents/scripts/agents-session.py`
  - `.agents/scripts/tests/test_execution_command_flow.py`
  - `.agents/scripts/README.md`
  - `.agents/a-docs/standards/agents-usage.md`
  - `.agents/a-docs/standards/scripts-usage.md`
  - `.agents/tools.json`
  - `README.md`
- Key decisions:
  - Closure is still defined by strict verification; the new command only orchestrates it.
  - `.active_session` stays unchanged unless `--next-session` is provided.

## Test Gate
- Move to `ready_for_test` only after implementation checkpoint.
- Record command, result, and evidence before marking done.

### Test Evidence
- Command: `make test-scripts`; `make lint-scripts`; `make lint`; `make all`
- Result: pass
- Evidence: `93 passed, 5 deselected`; `All checks passed!`; `Issues found: 0`; `✓ All validations passed`

---
*Template: `.agents/a-docs/templates/task.md`*

## Task List
- [ ] T-04 integration-test-task
- [ ] T-05 integration-test-task
- [ ] T-06 integration-test-task
