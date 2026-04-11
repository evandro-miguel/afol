---
doc_type: task
id: 260404_0927_artifact-utility-enforcement_task_01
theme: artifact-utility-enforcement
status: final
owners:
- worker
- tester
workstream_intent: delivery
artifact_purpose: Track the implementation and validation steps for artifact utility
  enforcement.
created_at: '2026-04-04T09:27:02-03:00'
updated_at: '2026-04-04T10:07:35-03:00'
roadmap_feature: F-08
parent_spec: 260306_context-driven-execution-commands_spec_01
child_spec: ''
depends_on:
- 260404_0927_artifact-utility-enforcement_plan_01
links:
  plan: 260404_0927_artifact-utility-enforcement_plan_01
  roadmap: docs/arc/GENERAL-ROADMAP.md
---

# Tasks: artifact-utility-enforcement

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | worker | Implemented minimal artifact seeding, semantic utility checks, docs, and full validation evidence |

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
- [x] Check [../lessons/general-lessons.md](../lessons/general-lessons.md)
- [x] Check lesson entries in [../lessons/entries/](../lessons/entries/)

### Useful Resources
- Rules useful for this task:
  - [x] Artifacts must have a concrete reason to exist
- Docs useful for this task:
  - [x] docs/standards/workflow.md
- Skills useful for this task:
  - [x] workbench-agent-teams
- Integrations useful for this task:
  - [x] mini + spark specialist passes

## Implementation Checkpoint
- Files touched:
  - `.agents/scripts/lib/workflow_manifest.py`
  - `.agents/scripts/lib/artifact_utility.py`
  - `.agents/scripts/agents-new.py`
  - `.agents/scripts/lib/execution_commands.py`
  - `.agents/scripts/agents-review.py`
  - `.agents/scripts/verify-tasks.py`
  - `.agents/scripts/lib/agents_config.py`
  - `.agents/agents.config`
  - `docs/standards/Makefile`
- Key decisions:
  - Separate artifact catalog from intent-based artifact policy.
  - Treat placeholder-only artifacts as semantically invalid.
  - Shrink default delivery creation to `task` and default closure creation to `report`.
  - Infer a safer non-delivery intent for obvious research/brainstorm/exploration/closure themes when `--intent` is omitted.

## Test Gate
- Move to `ready_for_test` only after implementation checkpoint.
- Record command, result, and evidence before marking done.

### Test Evidence
- Command: `python3 -m py_compile .agents/scripts/agents-new.py .agents/scripts/agents-review.py .agents/scripts/lib/execution_commands.py .agents/scripts/lib/workflow_manifest.py .agents/scripts/lib/agents_config.py`
- Result: pass
- Evidence: syntax validation passed for the changed workflow modules.
- Command: `uv run --with pyyaml python .agents/scripts/tests/test_agents_new_quick_mode.py`
- Result: pass
- Evidence: `11 tests` passed after minimal delivery defaults and intent inference landed.
- Command: `uv run --with pyyaml --with pytest python -m pytest -q .agents/scripts/tests/test_execution_command_scenarios.py .agents/scripts/tests/test_agents_status_summary.py .agents/scripts/tests/test_execution_command_flow.py .agents/scripts/tests/integration/test_critical_workflows.py`
- Result: pass
- Evidence: `44 passed` covering readiness, review, catchup, and integration flows.
- Command: `make lint`
- Result: pass
- Evidence: markdown lint reported `Issues found: 0`.
- Command: `make all`
- Result: pass
- Evidence: doctor, map/index refresh, lint, tool smoke, telemetry validation, and `177 passed` in the full script suite.

---
*Template: `docs/templates/task.md`*
