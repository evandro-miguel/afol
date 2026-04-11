---
doc_type: task
id: 260323_1705_universal-skills-runtime-integration_task_01
theme: universal-skills-runtime-integration
status: active
owners:
- worker
- tester
created_at: '2026-03-23T17:05:28-03:00'
updated_at: '2026-03-23T17:25:44-03:00'
roadmap_feature: F-10
parent_spec: 260323_1704_universal-skills-runtime-integration_spec_01
child_spec: ''
depends_on:
- 260323_1705_universal-skills-runtime-integration_plan_01
links:
  plan: 260323_1705_universal-skills-runtime-integration_plan_01
  roadmap: .agents/arc/GENERAL-ROADMAP.md
---

# Tasks: universal-skills-runtime-integration

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | spark-worker | Worker `Ampere` delivered the `skills-sync` contract migration, runtime/profile resolution, manifest v2, and dedicated tests; orchestrator verified the slice in the main repo. |
| T-02 | done | mini-worker | Worker `Meitner` delivered bootstrap/runtime docs integration and runtime-compatibility coverage; orchestrator verified the slice in the main repo. |
| T-03 | done | orchestrator | Integrated both slices, ran full repo validation, and finalized the governed workstream artifacts. |

**State values:** `pending` | `in_progress` | `ready_for_test` | `testing` | `done` | `blocked`

**Task ID format:** `T-01`, `T-02`, ... (ou `T-001` para boards grandes)

**State marker rules:** See [../standards/checkbox-protocol.md](../standards/checkbox-protocol.md)

## Governance Context
- Roadmap feature: `F-10`
- Parent spec: `260323_1704_universal-skills-runtime-integration_spec_01`
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
  - [x] Bootstrap output must stay generic/history-free.
- Docs useful for this task:
  - [x] `.agents/a-docs/standards/skills-sync.md`
  - [x] `.agents/a-docs/agentic/agents-skills-sync.md`
  - [x] `.agents/cache/universal-skills/README.md`
- Skills useful for this task:
  - [x] `projects-workflow`
  - [x] `docs-operations`
- Integrations useful for this task:
  - [x] upstream `universal-skills`

## Implementation Checkpoint
- Files touched:
  - `.agents/scripts/agents-bootstrap.py`
  - `.agents/agents.config`
  - skills-sync/bootstrap docs
  - `.agents/scripts/tests/test_runtime_compatibility.py`
- Key decisions:
  - The scaffold remains the operator-facing layer and adopts upstream universal-skills concepts instead of duplicating a weaker local model.
  - Work is split between a spark implementation slice and a mini integration/docs slice with disjoint ownership.

## Test Gate
- Move to `ready_for_test` only after implementation checkpoint.
- Record command, result, and evidence before marking done.

### Test Evidence
- Command: `./.agents/scripts/.venv/bin/pytest .agents/scripts/tests/test_runtime_compatibility.py -q`
- Result: pass
- Evidence: `14 passed`
- Follow-up:
  - `./.agents/scripts/.venv/bin/pytest .agents/scripts/tests/test_agents_skills_sync.py -q` -> `5 passed`
  - `make test-scripts` -> `129 passed, 6 deselected`
  - `make lint-scripts` -> passed
  - `make doctor` -> passed
  - `make all` -> passed
  - `./.agents/agents skills-sync status` -> passed
  - `./.agents/agents bootstrap <tmpdir> --skip-checks` -> passed
  - `./.agents/agents bootstrap <tmpdir> --partial --skip-checks` -> passed

---
*Template: `.agents/a-docs/templates/task.md`*
