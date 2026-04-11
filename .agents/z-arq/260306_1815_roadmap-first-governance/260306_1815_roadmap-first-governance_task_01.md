---
doc_type: task
id: 260306_1815_roadmap-first-governance_task_01
theme: roadmap-first-governance
status: active
owners:
- worker
- tester
created_at: '2026-03-06T18:15:16-03:00'
updated_at: '2026-03-06T19:29:04-03:00'
roadmap_feature: F-01
parent_spec: 260306_roadmap-first-delivery-system_spec_01
child_spec: ''
depends_on:
- 260306_1815_roadmap-first-governance_plan_01
links:
  plan: 260306_1815_roadmap-first-governance_plan_01
  roadmap: .agents/arc/GENERAL-ROADMAP.md
---

# Tasks: roadmap-first-governance

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | worker | Defined the roadmap-first governance model and rewrote the scaffold roadmap. |
| T-02 | done | worker | Authored the parent spec that defines mandatory roadmap/spec/child-spec behavior. |
| T-03 | done | worker | Rewrote templates, standards, and agent guidance around the new philosophy. |
| T-04 | done | worker | Enforced roadmap/spec linkage in workflow and validation tooling. |
| T-05 | done | worker | Fixed telemetry parity, bootstrap baseline, test runner, CI baseline, and validation semantics under the new governance model. |

**State values:** `pending` | `in_progress` | `ready_for_test` | `testing` | `done` | `blocked`

**Task ID format:** `T-01`, `T-02`, ... (ou `T-001` para boards grandes)

**State marker rules:** See [../standards/checkbox-protocol.md](../standards/checkbox-protocol.md)

## Relevant Lessons

Before starting work, consult relevant resources:

### Prevention Rules
- [ ] Check [../lessons/general-lessons.md](../lessons/general-lessons.md)
- [ ] Check lesson entries in [../lessons/entries/](../lessons/entries/)

### Useful Resources
- Rules useful for this task:
  - [ ] `.agents/rules/RULE-002-workstream-creation.md`
- Docs useful for this task:
  - [ ] `.agents/arc/GENERAL-ROADMAP.md`
  - [ ] `.agents/arc/SPECS/INDEX.md`
- Skills useful for this task:
  - [ ] `agentic-system-workflow`
- Integrations useful for this task:
  - [ ] `N/A`

## Implementation Checkpoint
- Files touched:
  - `.agents/arc/GENERAL-ROADMAP.md`
  - `.agents/arc/SPECS/260306_roadmap-first-delivery-system_spec_01.md`
  - `.agents/a-docs/templates/`
  - `.agents/a-docs/standards/workflow.md`
  - `.agents/rules/RULE-002-workstream-creation.md`
  - `.agents/agents`
  - `.agents/a-docs/standards/Makefile`
  - `.agents/tools.json`
  - `.agents/agents.config`
  - `.agents/scripts/agents-new.py`
  - `.agents/scripts/agents-doctor.py`
  - `.agents/scripts/agents-telemetry.py`
  - `.agents/scripts/agents-wb-update.py`
  - `.agents/scripts/agents-bootstrap.py`
  - `.agents/scripts/agents-index.py`
  - `.agents/scripts/verify-tasks.py`
  - `.agents/scripts/tests/test_agents_new_quick_mode.py`
  - `.agents/scripts/tests/test_agents_telemetry.py`
  - `.agents/scripts/tests/test_agents_wb_update_task_marker.py`
  - `.agents/scripts/tests/test_verify_tasks_strict.py`
  - `.agents/scripts/tests/unit/test_refactored_functions.py`
  - `.agents/scripts/tests/integration/test_critical_workflows.py`
  - `.agents/scripts/README.md`
  - `.github/workflows/agents-scaffold-ci.yml`
- Key decisions:
  - Roadmap becomes the canonical feature backlog for downstream projects.
  - Parent specs describe philosophy, expected behavior, and user journey before implementation.
  - Large features must declare child specs before execution begins.
  - Quick mode stays available, but standard workstream creation now requires roadmap/spec governance fields.
  - `make all` validates the scaffold baseline and does not depend on transient active-session state.
  - Default script testing now uses pytest from the `.agents/scripts` project environment while excluding side-effecting integration tests.

## Test Gate
- Move to `ready_for_test` only after implementation checkpoint.
- Record command, result, and evidence before marking done.

### Test Evidence
- Command: `make lint`
- Result: pass
- Evidence: 0 issues across `.agents/`
- Command: `make test-scripts`
- Result: pass
- Evidence: 68 passed, 5 deselected
- Command: `make doctor`
- Result: pass with 1 pre-existing info item
- Evidence: roadmap governance validation found 5 features; no errors
- Command: `make all`
- Result: pass
- Evidence: full scaffold validation completed without requiring an active-session gate

---
*Template: `.agents/a-docs/templates/task.md`*
