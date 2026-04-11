---
doc_type: task
id: 260404_0854_artifact-manifest-readiness_task_01
theme: artifact-manifest-readiness
status: final
owners:
- worker
- tester
created_at: '2026-04-04T08:54:11-03:00'
updated_at: '2026-04-04T09:07:39-03:00'
roadmap_feature: F-08
parent_spec: 260306_context-driven-execution-commands_spec_01
child_spec: 260306_artifact-resolution-layer_spec_01
depends_on:
- 260404_0854_artifact-manifest-readiness_plan_01
links:
  plan: 260404_0854_artifact-manifest-readiness_plan_01
  roadmap: docs/arc/GENERAL-ROADMAP.md
---

# Tasks: artifact-manifest-readiness

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | worker | Normalize lint exclusions so tmp workspaces and raw map extras never count as markdown debt. |
| T-02 | done | worker | Add shared artifact manifest dependency/readiness logic to creation and status flows. |
| T-03 | done | tester | Re-run targeted tests plus repo-wide validation and record evidence. |

**State values:** `pending` | `in_progress` | `ready_for_test` | `testing` | `done` | `blocked`

**Task ID format:** `T-01`, `T-02`, ... (ou `T-001` para boards grandes)

**State marker rules:** See [../standards/checkbox-protocol.md](../standards/checkbox-protocol.md)

## Governance Context
- Roadmap feature: `F-08`
- Parent spec: `260306_context-driven-execution-commands_spec_01`
- Child spec: `260306_artifact-resolution-layer_spec_01`
- Task rule:
  - Tasks execute approved intent; they do not replace roadmap/spec definition.

## Relevant Lessons

Before starting work, consult relevant resources:

### Prevention Rules
- [x] Check [../lessons/general-lessons.md](../lessons/general-lessons.md)
- [x] Check lesson entries in [../lessons/entries/](../lessons/entries/)

### Useful Resources
- Rules useful for this task:
  - [x] `AGENTS.md` workbench, roadmap/spec, and verification gates
- Docs useful for this task:
  - [x] `docs/arc/GENERAL-ROADMAP.md`
  - [x] `docs/arc/SPECS/260306_context-driven-execution-commands_spec_01.md`
  - [x] `docs/arc/SPECS/260306_artifact-resolution-layer_spec_01.md`
- Skills useful for this task:
  - [x] `workbench-agent-teams`
- Integrations useful for this task:
  - [x] none

## Implementation Checkpoint
- Files touched:
  - `.agents/agents.config`
  - `.agents/scripts/lib/workflow_manifest.py`
  - `.agents/scripts/agents-lint-docs.py`
  - `.agents/scripts/agents-new.py`
  - `.agents/scripts/agents-status.py`
  - `.agents/scripts/lib/execution_commands.py`
  - `.agents/scripts/tests/test_agents_lint_noise_reduction.py`
  - `.agents/scripts/tests/test_agents_new_quick_mode.py`
  - `.agents/scripts/tests/test_execution_command_scenarios.py`
  - `.agents/scripts/tests/test_agents_status_summary.py`
  - `.agents/scripts/tests/test_runtime_compatibility.py`
  - `.agents/scripts/tests/integration/test_critical_workflows.py`
  - `README.md`
  - `docs/agentic/agents-config.md`
  - `docs/agentic/agents-new.md`
  - `docs/standards/agents-usage.md`
  - `docs/standards/scripts-usage.md`
  - `docs/lessons/entries/20260404_0905_tmp-workspaces-must-be-lint-excluded.md`
- Key decisions:
  - Share the manifest contract through `lib/workflow_manifest.py` and let `agents-status` consume exact manifest entries instead of inferring from hardcoded aliases.
  - Exclude disposable tmp paths and raw codemap evidence from markdown lint by default.

## Test Gate
- Move to `ready_for_test` only after implementation checkpoint.
- Record command, result, and evidence before marking done.

### Test Evidence
- Command: `uv run --with pyyaml python .agents/scripts/tests/test_agents_lint_noise_reduction.py`
- Result: pass
- Evidence: `Ran 4 tests` and `OK`
- Command: `uv run --with pyyaml python .agents/scripts/tests/test_agents_new_quick_mode.py`
- Result: pass
- Evidence: `Ran 9 tests` and `OK`
- Command: `uv run --with pyyaml python .agents/scripts/tests/test_execution_command_scenarios.py`
- Result: pass
- Evidence: `Ran 23 tests` and `OK`
- Command: `uv run --with pyyaml python .agents/scripts/tests/test_agents_status_summary.py`
- Result: pass
- Evidence: `Ran 1 test` and `OK`
- Command: `uv run --with pyyaml python .agents/scripts/tests/test_runtime_compatibility.py`
- Result: pass
- Evidence: `Ran 17 tests` and `OK`
- Command: `uv run --with pyyaml --with pytest python -m pytest -q .agents/scripts/tests/integration/test_critical_workflows.py -k new_quick_workflow`
- Result: pass
- Evidence: `1 passed, 5 deselected`
- Command: `uv run --with pyyaml --with pytest python -m pytest -q .agents/scripts/tests/integration/test_critical_workflows.py -k session_catchup_temp_repo_scenarios`
- Result: pass
- Evidence: `1 passed, 5 deselected`
- Command: `make lint`
- Result: pass
- Evidence: `Issues found: 0`
- Command: `make all`
- Result: pass
- Evidence: `172 passed` and final banner `All validations passed`

---
*Template: `docs/templates/task.md`*
