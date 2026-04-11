---
doc_type: task
id: 260404_0843_workflow-manifest-externalization_task_01
theme: workflow-manifest-externalization
status: final
owners:
- worker
- tester
created_at: '2026-04-04T08:43:39-03:00'
updated_at: '2026-04-04T08:51:43-03:00'
roadmap_feature: F-11
parent_spec: 260323_1752_workflow-and-bootstrap-integration_spec_01
child_spec: ''
depends_on:
- 260404_0843_workflow-manifest-externalization_plan_01
links:
  plan: 260404_0843_workflow-manifest-externalization_plan_01
  roadmap: docs/arc/GENERAL-ROADMAP.md
---

# Tasks: workflow-manifest-externalization

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | worker | Externalized `agents-new` manifest into config with fallback-safe defaults. |
| T-02 | done | worker | Aligned command/docs contract with the config-backed manifest. |
| T-03 | done | tester | Re-ran focused unit/integration coverage for `agents new` and recorded evidence. |

**State values:** `pending` | `in_progress` | `ready_for_test` | `testing` | `done` | `blocked`

**Task ID format:** `T-01`, `T-02`, ... (ou `T-001` para boards grandes)

**State marker rules:** See [../standards/checkbox-protocol.md](../standards/checkbox-protocol.md)

## Governance Context
- Roadmap feature: `F-11`
- Parent spec: `260323_1752_workflow-and-bootstrap-integration_spec_01`
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
  - [x] `AGENTS.md` roadmap/spec governance
- Docs useful for this task:
  - [x] `docs/arc/GENERAL-ROADMAP.md`
  - [x] `docs/arc/SPECS/260323_1752_workflow-and-bootstrap-integration_spec_01.md`
  - [x] `docs/agentic/agents-new.md`
- Skills useful for this task:
  - [x] `workbench-agent-teams`
- Integrations useful for this task:
  - [x] `rag-docs`

## Implementation Checkpoint
- Files touched:
  - `.agents/scripts/agents-new.py`
  - `.agents/scripts/lib/agents_config.py`
  - `.agents/agents.config`
  - `docs/agentic/agents-new.md`
- Key decisions:
  - Keep the default artifact set unchanged while moving its source of truth into config-backed data.

## Test Gate
- Move to `ready_for_test` only after implementation checkpoint.
- Record command, result, and evidence before marking done.

### Test Evidence
- Command: `uv run --with pyyaml python .agents/scripts/tests/test_agents_new_quick_mode.py`
- Result: pass
- Evidence: `Ran 9 tests in 0.055s` and `OK`
- Command: `uv run --with pyyaml --with pytest python -m pytest -q .agents/scripts/tests/integration/test_critical_workflows.py -k new_quick_workflow`
- Result: pass
- Evidence: `1 passed, 5 deselected`
- Command: `python3 -m py_compile .agents/scripts/agents-new.py .agents/scripts/lib/agents_config.py .agents/scripts/tests/test_agents_new_quick_mode.py`
- Result: pass
- Evidence: command exited cleanly with no output
- Command: `make lint`
- Result: pass
- Evidence: final summary reported `Errors: 0`, `Warnings: 398`

---
*Template: `docs/templates/task.md`*
