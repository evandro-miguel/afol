---
doc_type: task
id: 260323_1507_bootstrap-partial-install_task_01
theme: bootstrap-partial-install
status: done
owners:
- worker
- tester
created_at: '2026-03-23T15:07:03-03:00'
updated_at: '2026-03-23T15:24:34-03:00'
roadmap_feature: F-04
parent_spec: 260306_roadmap-first-delivery-system_spec_01
child_spec: ''
depends_on:
- 260323_1507_bootstrap-partial-install_plan_01
links:
  plan: 260323_1507_bootstrap-partial-install_plan_01
  roadmap: .agents/arc/GENERAL-ROADMAP.md
---

# Tasks: bootstrap-partial-install

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | worker | Added explicit partial install mode, cleaned target bootstrap warnings, and revalidated both install paths. |

**State values:** `pending` | `in_progress` | `ready_for_test` | `testing` | `done` | `blocked`

**Task ID format:** `T-01`, `T-02`, ... (ou `T-001` para boards grandes)

**State marker rules:** See [../standards/checkbox-protocol.md](../standards/checkbox-protocol.md)

## Governance Context
- Roadmap feature: `F-04`
- Parent spec: `260306_roadmap-first-delivery-system_spec_01`
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
  - [x] Bootstrap output must stay generic/history-free.
- Docs useful for this task:
  - [x] `.agents/a-docs/agentic/agents-bootstrap.md`
  - [x] `.agents/a-docs/standards/bootstrap-other-repo.md`
- Skills useful for this task:
  - [x] `projects-workflow`
  - [x] `docs-operations`
- Integrations useful for this task:
  - [x] Optional `skills-sync` in target repos

## Implementation Checkpoint
- Files touched:
  - `.agents/scripts/agents-bootstrap.py`
  - `.agents/scripts/agents-doctor.py`
  - `.agents/agents.config`
  - `.agents/scripts/tests/test_runtime_compatibility.py`
  - `.agents/scripts/tests/test_agents_doctor_fix.py`
  - `.agents/a-docs/standards/Makefile`
  - bootstrap docs and README references
- Key decisions:
  - Existing projects get an explicit `--partial` install mode with adoption-oriented roadmap/spec starters.
  - Imported skill docs are excluded from markdown lint because `skills-check` is the proper validation layer for them.
  - Partial installs preserve a repo-owned `make all`; scaffold aggregate validation remains available as `make agents-all`.

## Test Gate
- Move to `ready_for_test` only after implementation checkpoint.
- Record command, result, and evidence before marking done.

### Test Evidence
- Command: `make lint-scripts && make test-scripts && make lint && make doctor && make all`
- Result: pass
- Evidence: local scaffold validations passed with `123 passed, 6 deselected` in unit tests and clean `doctor`/lint reports.

- Command: `cd .agents/scripts && ./.venv/bin/pytest tests/integration/test_critical_workflows.py -v`
- Result: pass
- Evidence: `6 passed` in the critical workflow integration suite.

- Command: `./.agents/agents bootstrap <fresh-target>` and `./.agents/agents bootstrap <existing-target> --partial`
- Result: pass
- Evidence: both target repos completed install and passed target `doctor` and `make lint`; the partial target preserved its local `all` target without override warnings.

---
*Template: `.agents/a-docs/templates/task.md`*

## Task List
- [x] T-01 explicit partial install and clean bootstrap validation
