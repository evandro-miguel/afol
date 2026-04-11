---
doc_type: task
id: 260323_1407_bootstrap-generic-export_task_01
theme: bootstrap-generic-export
status: done
owners:
- worker
- tester
created_at: '2026-03-23T14:07:57-03:00'
updated_at: '2026-03-23T14:18:47-03:00'
roadmap_feature: F-04
parent_spec: 260306_roadmap-first-delivery-system_spec_01
child_spec: ''
depends_on:
- 260323_1407_bootstrap-generic-export_plan_01
links:
  plan: 260323_1407_bootstrap-generic-export_plan_01
  roadmap: .agents/arc/GENERAL-ROADMAP.md
---

# Tasks: bootstrap-generic-export

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | worker | Sanitized bootstrap export and validated it end-to-end in a fresh target repo. |

**State values:** `pending` | `in_progress` | `ready_for_test` | `testing` | `done` | `blocked`

**Task ID format:** `T-01`, `T-02`, ... (ou `T-001` para boards grandes)

**State marker rules:** See [../standards/checkbox-protocol.md](../standards/checkbox-protocol.md)

## Governance Context
- Roadmap feature: `F-04`
- Parent spec: `260306_roadmap-first-delivery-system_spec_01`
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
  - [x] Bootstrap output must remain generic and history-free for downstream repos.
- Docs useful for this task:
  - [x] `.agents/a-docs/agentic/agents-bootstrap.md`
- Skills useful for this task:
  - [x] `projects-workflow`
  - [x] `docs-operations`
- Integrations useful for this task:
  - [x] Optional `skills-sync` bootstrap path

## Implementation Checkpoint
- Files touched:
  - `.agents/scripts/agents-bootstrap.py`
  - `.agents/scripts/tests/test_runtime_compatibility.py`
  - `.agents/a-docs/agentic/agents-bootstrap.md`
  - `.agents/a-docs/standards/agents-usage.md`
  - `.agents/a-docs/standards/scripts-reference.md`
  - `.agents/scripts/README.md`
  - `README.md`
  - `.agents/a-docs/lessons/entries/20260323_1420_bootstrap-must-export-generic-project-state.md`
- Key decisions:
  - Generate starter roadmap/spec artifacts instead of copying live `arc` state.
  - Filter copied `a-docs` content to remove knowledge, lessons, and telemetry history.

## Test Gate
- Move to `ready_for_test` only after implementation checkpoint.
- Record command, result, and evidence before marking done.

### Test Evidence
- Command: `make test-scripts && make lint && make lint-scripts && make doctor && make all`
- Result: pass
- Evidence: repo validations passed; runtime bootstrap regression tests and aggregate validation are green.

---
*Template: `.agents/a-docs/templates/task.md`*

## Task List
- [ ] T-03 integration-test-task
