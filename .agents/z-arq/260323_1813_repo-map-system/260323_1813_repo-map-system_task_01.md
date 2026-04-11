---
doc_type: task
id: 260323_1813_repo-map-system_task_01
theme: repo-map-system
status: active
owners:
- worker
- tester
created_at: '2026-03-23T18:13:06-03:00'
updated_at: '2026-03-23T18:30:47-03:00'
roadmap_feature: F-11
parent_spec: 260323_1741_current-state-maps-and-goal-state-governance_spec_01
child_spec: 260323_1750_current-state-map-contract_spec_01
depends_on:
- 260323_1813_repo-map-system_plan_01
links:
  plan: 260323_1813_repo-map-system_plan_01
  roadmap: .agents/arc/GENERAL-ROADMAP.md
---

# Tasks: repo-map-system

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | orchestrator | Compare the scaffold against OpenCode `repo-organizer` and isolate the reusable contract |
| T-02 | done | orchestrator | Add native `repo-map` command/config/catalog wiring and a dedicated standard |
| T-03 | done | orchestrator | Added script coverage for README contract normalization and completed command-reference docs |
| T-04 | done | orchestrator | Ran `.agents/agents repo-map .` against this repository and validated the generated codemap contract |

**State values:** `pending` | `in_progress` | `ready_for_test` | `testing` | `done` | `blocked`

**Task ID format:** `T-01`, `T-02`, ... (ou `T-001` para boards grandes)

**State marker rules:** See [../standards/checkbox-protocol.md](../standards/checkbox-protocol.md)

## Governance Context
- Roadmap feature: `F-11`
- Parent spec: `260323_1741_current-state-maps-and-goal-state-governance_spec_01`
- Child spec: `260323_1750_current-state-map-contract_spec_01`
- Task rule:
  - Tasks execute approved intent; they do not replace roadmap/spec definition.

## Relevant Lessons

Before starting work, consult relevant resources:

### Prevention Rules
- [ ] Check [../lessons/general-lessons.md](../lessons/general-lessons.md)
- [ ] Check lesson entries in [../lessons/entries/](../lessons/entries/)

### Useful Resources
- Rules useful for this task:
  - [ ] `.agents/rules/RULE-002-workstream-creation.md`
- Docs useful for this task:
  - [ ] `.agents/a-docs/standards/repo-map.md`
  - [ ] `.agents/a-docs/standards/structure-map.md`
- Skills useful for this task:
  - [ ] `deep-code-analisys`
- Integrations useful for this task:
  - [ ] `~/apps/docker-analisys-tools/scripts/run-repo-map.sh`

## Implementation Checkpoint
- Files touched:
  - `.agents/scripts/agents-repo-map.py`
  - `.agents/agents`
  - `.agents/agents.config`
  - `.agents/tools.json`
  - `.agents/a-docs/standards/repo-map.md`
- Key decisions:
  - The scaffold imports the `repo-organizer` model as a command + output contract, not as a second orchestration layer.

## Test Gate
- Move to `ready_for_test` only after implementation checkpoint.
- Record command, result, and evidence before marking done.

### Test Evidence
- Command: `make doctor && make lint && make test-scripts`
- Result: passed
- Evidence: `make doctor` -> clean; `make lint` -> 0 issues; `make test-scripts` -> `134 passed, 6 deselected`; `.agents/agents repo-map .` -> generated `.agents/arc/map/*.md` plus `extra/`

---
*Template: `.agents/a-docs/templates/task.md`*
