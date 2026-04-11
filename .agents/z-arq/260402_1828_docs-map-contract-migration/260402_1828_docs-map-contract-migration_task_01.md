---
doc_type: task
id: 260402_1828_docs-map-contract-migration_task_01
theme: docs-map-contract-migration
status: done
owners:
- worker
- tester
created_at: '2026-04-02T18:28:00-03:00'
updated_at: '2026-04-02T18:40:44-03:00'
roadmap_feature: F-11
parent_spec: 260323_1741_current-state-maps-and-goal-state-governance_spec_01
child_spec: 260323_1750_current-state-map-contract_spec_01
depends_on:
- 260402_1828_docs-map-contract-migration_plan_01
links:
  plan: 260402_1828_docs-map-contract-migration_plan_01
  roadmap: .agents/arc/GENERAL-ROADMAP.md
---

# Tasks: docs-map-contract-migration

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | worker | Retargeted config, wrapper help, repo-map runtime, and generated output to `docs/map` |
| T-02 | done | worker | Bootstrap now provisions a generic `docs/map/README.md` baseline and does not export source workbench/map history |
| T-03 | done | worker | Updated canonical docs, standards, wrappers, roadmap/specs, and compatibility skill references |
| T-04 | done | tester | Passed focused tests, regenerated `docs/map`, refreshed structure docs, and passed downstream full/partial bootstrap proof |

**State values:** `pending` | `in_progress` | `ready_for_test` | `testing` | `done` | `blocked`

## Implementation Checkpoint
- Files touched:
  - `.agents/agents.config`
  - `.agents/scripts/lib/agents_config.py`
  - `.agents/scripts/agents-doctor.py`
  - `.agents/scripts/agents-repo-map.py`
  - `.agents/scripts/agents-bootstrap.py`
  - `.agents/agents`
  - `.agents/tools.json`
  - `.agents/a-docs/standards/repo-map.md`
  - `.agents/a-docs/standards/agents-usage.md`
  - `.agents/a-docs/standards/scripts-usage.md`
  - `.agents/a-docs/standards/workflow.md`
  - `.agents/a-docs/standards/structure-map.md`
  - `.agents/a-docs/standards/bootstrap-other-repo.md`
  - `.agents/arc/GENERAL-ROADMAP.md`
  - `.agents/arc/SPECS/260323_1741_current-state-maps-and-goal-state-governance_spec_01.md`
  - `.agents/arc/SPECS/260323_1750_current-state-map-contract_spec_01.md`
  - `.agents/arc/SPECS/260323_1751_goal-state-canon_spec_01.md`
  - `.agents/arc/SPECS/260323_1752_workflow-and-bootstrap-integration_spec_01.md`
  - `.agents/scripts/README.md`
  - `.agents/skills/agentic-system-workflow/references/core/README.md`
  - `.agents/source/universal-skills/skills/agentic-system-workflow/references/core/README.md`
  - `.agents/cache/universal-skills/skills/deep-code-analisys/`
  - `README.md`
  - `docs/map/`
  - `.agents/arc/structure/`
  - tests covering repo-map and downstream bootstrap behavior

## Test Evidence
- Command: `uv run --project .agents/scripts pytest .agents/scripts/tests/test_agents_repo_map.py -q`
- Result: pass
- Evidence: `4 passed`
- Command: `uv run --project .agents/scripts pytest .agents/scripts/tests/test_runtime_compatibility.py -q`
- Result: pass
- Evidence: `17 passed`
- Command: `uv run --project .agents/scripts pytest .agents/scripts/tests/integration/test_critical_workflows.py -q`
- Result: pass
- Evidence: `6 passed`
- Command: `make all`
- Result: pass
- Evidence: `164 passed` and final banner `All validations passed`
