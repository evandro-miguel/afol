---
doc_type: task
id: 260307_1734_persistent-planning-memory_task_01
theme: persistent-planning-memory
status: active
owners:
- worker
- tester
created_at: '2026-03-07T17:34:00-03:00'
updated_at: '2026-03-07T18:19:40-03:00'
roadmap_feature: F-09
parent_spec: 260307_persistent-planning-memory_spec_01
child_spec: ''
depends_on:
- 260307_1734_persistent-planning-memory_plan_01
links:
  plan: 260307_1734_persistent-planning-memory_plan_01
  roadmap: 260223_0000_arc_roadmap_01
---

# Tasks: persistent-planning-memory

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | worker | Convert the external pattern into a system-native product proposal. |
| T-02 | done | worker | Added `session catchup` with JSON/text output for session drift, stale artifacts, and next-step guidance. |
| T-03 | done | worker | Added advisory freshness heuristics for `log`/`research`/`report` against repo drift. |
| T-04 | done | tester | Added tests, docs, and direct command verification for the lifecycle path. |

**State values:** `pending` | `in_progress` | `ready_for_test` | `testing` | `done` | `blocked`

**Task ID format:** `T-01`, `T-02`, ...

## Governance Context
- Roadmap feature: `F-09`
- Parent spec: `260307_persistent-planning-memory_spec_01`
- Child spec:
  - none
- Task rule:
  - Tasks execute approved intent; they do not replace roadmap/spec definition.

## Relevant Lessons

Before starting work, consult relevant resources:

### Prevention Rules
- [x] Check [../lessons/general-lessons.md](../lessons/general-lessons.md)
- [x] Check lesson entries in [../lessons/entries/](../lessons/entries/)

### Useful Resources
- Rules useful for this task:
  - [x] `.agents/rules/RULE-002-workstream-creation.md`
- Docs useful for this task:
  - [x] `README.md`
  - [x] `AGENTS.md`
- Skills useful for this task:
  - [x] `agentic-system-workflow`
- Integrations useful for this task:
  - [ ] none

## Implementation Checkpoint
- Files touched:
  - `.agents/arc/GENERAL-ROADMAP.md`
  - `.agents/arc/SPECS/260307_persistent-planning-memory_spec_01.md`
  - `.agents/scripts/lib/execution_commands.py`
  - `.agents/scripts/agents-session.py`
  - `.agents/scripts/agents-review.py`
  - `.agents/scripts/tests/test_execution_command_flow.py`
  - `.agents/scripts/README.md`
  - `.agents/agents`
  - `README.md`
  - `.agents/a-docs/standards/agents-usage.md`
  - `.agents/a-docs/standards/scripts-usage.md`
  - `.agents/tools.json`
  - `.agents/wb/260307_1734_persistent-planning-memory/*`
- Key decisions:
  - Keep workbench artifacts canonical.
  - Treat the external three-file model as a mapping layer, not a storage change.
  - Put the reusable catchup summary logic in `lib/execution_commands.py` so review/status-style commands can consume the same signal later.

## Test Gate
- Move to `ready_for_test` only after implementation checkpoint.
- Record command, result, and evidence before marking done.

### Test Evidence
- Command: `./.agents/scripts/.venv/bin/pytest .agents/scripts/tests/test_execution_command_flow.py -q`
- Result: pass
- Evidence: `14 passed in 0.09s`
- Command: `./.agents/scripts/.venv/bin/pytest .agents/scripts/tests/test_execution_command_scenarios.py -q`
- Result: pass
- Evidence: `20 passed in 0.05s`
- Command: `UV_CACHE_DIR=/tmp/uvcache make lint`
- Result: pass
- Evidence: `Files checked: 269` and `Issues found: 0`
- Command: `./.agents/scripts/.venv/bin/python .agents/scripts/agents-session.py catchup --session .agents/wb/260307_1734_persistent-planning-memory --json`
- Result: pass
- Evidence: emitted catchup JSON with stale-artifact and next-step guidance

---
*Template base: `.agents/a-docs/templates/task.md`*
