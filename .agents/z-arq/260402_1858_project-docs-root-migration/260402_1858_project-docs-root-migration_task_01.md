---
doc_type: task
id: 260402_1858_project-docs-root-migration_task_01
theme: project-docs-root-migration
status: final
owners:
- worker
- tester
created_at: '2026-04-02T18:58:13-03:00'
updated_at: '2026-04-02T20:36:36-03:00'
roadmap_feature: F-11
parent_spec: 260323_1741_current-state-maps-and-goal-state-governance_spec_01
child_spec: ''
depends_on:
- 260402_1858_project-docs-root-migration_plan_01
links:
  plan: 260402_1858_project-docs-root-migration_plan_01
  roadmap: docs/arc/GENERAL-ROADMAP.md
---

# Tasks: project-docs-root-migration

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | worker | docs-root migration, bootstrap retarget, and full validation completed |

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
- Reviewed `../lessons/general-lessons.md`
- Reviewed relevant lessons under `../lessons/entries/`

### Useful Resources
- Rules useful for this task:
  - `AGENTS.md` project-vs-agent boundary
- Docs useful for this task:
  - `docs/standards/workflow.md`
  - `docs/standards/bootstrap-other-repo.md`
  - `docs/standards/repo-map.md`
- Skills useful for this task:
  - `agentic-system-workflow`
- Integrations useful for this task:
  - `docker-analisys-tools` repo-map runner

## Implementation Checkpoint
- Files touched:
  - `.agents/agents.config`
  - `.agents/scripts/lib/agents_config.py`
  - `.agents/scripts/agents-bootstrap.py`
  - `.agents/scripts/agents-doctor.py`
  - `.agents/scripts/agents-structure-map.py`
  - `docs/standards/Makefile`
  - `AGENTS.md`
  - `Makefile`
- Key decisions:
  - project-owned canon now lives under `docs/`
  - `.agents/` remains reserved for runtime/workbench/skills state

## Test Gate
- Move to `ready_for_test` only after implementation checkpoint.
- Record command, result, and evidence before marking done.

### Test Evidence
- Command: `make lint-scripts`
- Result: pass
- Evidence: `All checks passed!`
- Command: `uv run --project .agents/scripts pytest .agents/scripts/tests/test_runtime_compatibility.py .agents/scripts/tests/integration/test_critical_workflows.py .agents/scripts/tests/test_verify_tasks_strict.py .agents/scripts/tests/test_agents_repo_map.py -q`
- Result: pass
- Evidence: `53 passed in 4.05s`
- Command: `make repo-map`
- Result: pass
- Evidence: `✓ Repository codemap completed`
- Command: `./.agents/agents skills-sync check`
- Result: pass
- Evidence: `PASS: skills structure and sync are valid`
- Command: `bun .agents/skills/writing-skills/scripts/check-universal-skills-sync.js --skill agentic-system-workflow,writing-skills --sync`
- Result: pass
- Evidence: `STATUS: PASS`
- Command: `./.agents/agents verify-tasks --strict .agents/wb/260402_1858_project-docs-root-migration`
- Result: pass
- Evidence: `All tasks completed`
- Command: `make all`
- Result: pass
- Evidence: `164 passed`

---
*Template: `docs/templates/task.md`*
