---
doc_type: task
id: 260323_2023_memory-provider-integration_task_01
theme: memory-provider-integration
status: active
owners:
- worker
- tester
created_at: '2026-03-23T20:23:41-03:00'
updated_at: '2026-03-23T20:39:25-03:00'
roadmap_feature: F-09
parent_spec: 260307_persistent-planning-memory_spec_01
child_spec: ''
depends_on:
- 260323_2023_memory-provider-integration_plan_01
links:
  plan: 260323_2023_memory-provider-integration_plan_01
  roadmap: .agents/arc/GENERAL-ROADMAP.md
---

# Tasks: memory-provider-integration

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | worker | Implemented `agents-memory.py`, wrapper dispatch, and config defaults |
| T-02 | done | worker | Updated tool catalog, Make targets, README, AGENTS, and standards docs |
| T-03 | done | tester | Added tests, ran validation, and recorded evidence |

**State values:** `pending` | `in_progress` | `ready_for_test` | `testing` | `done` | `blocked`

**Task ID format:** `T-01`, `T-02`, ... (ou `T-001` para boards grandes)

**State marker rules:** See [../standards/checkbox-protocol.md](../standards/checkbox-protocol.md)

## Governance Context
- Roadmap feature: `F-09`
- Parent spec: `260307_persistent-planning-memory_spec_01`
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
  - [x] `.agents/arc/SPECS/260307_persistent-planning-memory_spec_01.md`
- Docs useful for this task:
  - [x] `AGENTS.md`
  - [x] `README.md`
- Skills useful for this task:
  - [x] `agent-memory-obsidian-ops`
- Integrations useful for this task:
  - [x] `basic_memory`

## Implementation Checkpoint
- Files touched:
  - `.agents/scripts/agents-memory.py`
  - `.agents/scripts/lib/agents_config.py`
  - `.agents/scripts/tests/test_agents_memory.py`
  - `.agents/scripts/tests/test_agents_tools_catalog.py`
  - `.agents/agents`
  - `.agents/agents.config`
  - `.agents/tools.json`
  - `.agents/a-docs/standards/Makefile`
  - `AGENTS.md`
  - `README.md`
  - `.agents/a-docs/standards/agents-usage.md`
  - `.agents/a-docs/standards/scripts-usage.md`
- Key decisions:
  - Implement memory as a contract-emitting adapter, not shell-side MCP execution.
  - Keep external memory explicitly auxiliary to repo-local workbench and `knowledge`.

## Test Gate
- Move to `ready_for_test` only after implementation checkpoint.
- Record command, result, and evidence before marking done.

### Test Evidence
- Command: `./.agents/scripts/.venv/bin/pytest .agents/scripts/tests/test_agents_memory.py -q`
- Result: pass
- Evidence: `4 passed`
- Command: `./.agents/scripts/.venv/bin/pytest .agents/scripts/tests/test_agents_tools_catalog.py -q`
- Result: pass
- Evidence: `2 passed`
- Command: `make lint-scripts && make lint && ./.agents/agents tools validate && make doctor && make test-scripts && make all`
- Result: pass
- Evidence: `All checks passed`, `Catalog is valid`, `144 passed, 6 deselected`, `✓ All validations passed`

---
*Template: `.agents/a-docs/templates/task.md`*
