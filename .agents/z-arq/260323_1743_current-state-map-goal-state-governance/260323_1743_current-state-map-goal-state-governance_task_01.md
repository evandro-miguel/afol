---
doc_type: task
id: 260323_1743_current-state-map-goal-state-governance_task_01
theme: current-state-map-goal-state-governance
status: active
owners:
- worker
- tester
created_at: '2026-03-23T17:43:56-03:00'
updated_at: '2026-03-23T18:06:20-03:00'
roadmap_feature: F-11
parent_spec: 260323_1741_current-state-maps-and-goal-state-governance_spec_01
child_spec: ''
depends_on:
- 260323_1743_current-state-map-goal-state-governance_plan_01
links:
  plan: 260323_1743_current-state-map-goal-state-governance_plan_01
  roadmap: .agents/arc/GENERAL-ROADMAP.md
---

# Tasks: current-state-map-goal-state-governance

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | orchestrator | Create the roadmap entry, parent spec, and aligned planning package for F-11 |
| T-02 | done | Sagan | Define the `arc/map/` current-state contract in child spec `260323_1750_current-state-map-contract_spec_01` |
| T-03 | done | Heisenberg | Define the goal-state canon outside `arc/map/` in child spec `260323_1751_goal-state-canon_spec_01` |
| T-04 | done | Noether | Define workflow, bootstrap, and command integration in child spec `260323_1752_workflow-and-bootstrap-integration_spec_01` |
| T-05 | done | orchestrator | Integrated the approved split into bootstrap, status surfaces, standards, scaffold docs, and script tests without changing roadmap/spec/workbench authority |

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
- [ ] Check [../lessons/general-lessons.md](../lessons/general-lessons.md)
- [ ] Check lesson entries in [../lessons/entries/](../lessons/entries/)

### Useful Resources
- Rules useful for this task:
  - [ ] `.agents/rules/RULE-002-workstream-creation.md`
- Docs useful for this task:
  - [ ] `.agents/a-docs/standards/workflow.md`
  - [ ] `.agents/a-docs/standards/structure-map.md`
  - [ ] `.agents/a-docs/specs/README.md`
- Skills useful for this task:
  - [ ] `agentic-system-workflow`
  - [ ] `writing-skills`
- Integrations useful for this task:
  - [ ] `./.agents/agents knowledge`
  - [ ] `./.agents/agents index`

## Implementation Checkpoint
- Files touched:
  - `.agents/arc/GENERAL-ROADMAP.md`
  - `.agents/arc/SPECS/260323_1741_current-state-maps-and-goal-state-governance_spec_01.md`
  - `.agents/arc/SPECS/260323_1750_current-state-map-contract_spec_01.md`
  - `.agents/arc/SPECS/260323_1751_goal-state-canon_spec_01.md`
  - `.agents/arc/SPECS/260323_1752_workflow-and-bootstrap-integration_spec_01.md`
  - `.agents/arc/README.md`
  - `.agents/arc/map/README.md`
  - `.agents/a-docs/standards/structure-map.md`
  - `.agents/a-docs/standards/workflow.md`
  - `.agents/a-docs/standards/bootstrap-other-repo.md`
  - `.agents/scripts/lib/execution_commands.py`
  - `.agents/scripts/agents-status.py`
  - `.agents/scripts/agents-bootstrap.py`
  - `.agents/scripts/tests/test_execution_command_flow.py`
  - `.agents/scripts/tests/test_runtime_compatibility.py`
  - `README.md`
  - `.agents/wb/260323_1743_current-state-map-goal-state-governance/*`
- Key decisions:
  - `arc/map/` is being planned as a descriptive current-state surface, not a governance surface.
  - Desired-state docs remain outside `arc/map/` and keep roadmap/spec/workbench semantics unchanged.
  - Runtime surfaces may point to `arc/map/` for evidence, but authority remains roadmap/spec/workbench-first.

## Test Gate
- Move to `ready_for_test` only after implementation checkpoint.
- Record command, result, and evidence before marking done.

### Test Evidence
- Command: `./.agents/agents index && make doctor && make lint && make test-scripts`
- Result: pass
- Evidence: `SPECS/INDEX.md` updated successfully; `make doctor` reported no issues; `make lint` reported 0 issues across 291 files; `make test-scripts` passed with `131 passed, 6 deselected`

---
*Template: `.agents/a-docs/templates/task.md`*
