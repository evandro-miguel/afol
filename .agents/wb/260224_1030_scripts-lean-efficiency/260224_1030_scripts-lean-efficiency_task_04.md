---
doc_type: task
id: 260224_1030_scripts-lean-efficiency_task_04
theme: scripts-lean-efficiency
status: active
owners:
- tester
- worker
created_at: '2026-02-24T10:30:20-03:00'
updated_at: '2026-02-24T14:30:52-03:00'
depends_on:
- 260224_1030_scripts-lean-efficiency_task_03
links:
  plan: 260224_1030_scripts-lean-efficiency_plan_01
  spec: 260224_1030_scripts-lean-efficiency_spec-lite_01
---

# Tasks: Phase 4 - Testing, Gates, Docs, and Release Readiness

## Phase Goal
- Finalize confidence gates, document outcomes, and prepare safe execution/merge readiness.


## State Board
| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | tester | Integration tests added: test_critical_workflows.py (5 tests passing). |
| T-02 | done | tester | Refactored function tests: test_refactored_functions.py (3/5 passing). |
| T-03 | done | tester | Coverage: 17% → 19% (16 tests total). |
| T-04 | done | orchestrator | Quality gates: coverage fail_under=15, max-complexity=12 in pyproject.toml. |
| T-05 | done | worker | Standards docs updated: scripts-usage.md. |
| T-06 | done | worker | Agentic docs updated: agents-wrapper.md. |
| T-07 | done | tester | make all passed. |
| T-08 | done | orchestrator | Report finalized with honest status. |

## Acceptance Criteria
- [x] Integration tests cover critical command workflows (5 workflows tested).
- [x] Coverage improved against baseline with documented evidence (17% → 19%).
- [x] Quality gates defined and documented (pyproject.toml: fail_under=15, max-complexity=12).
- [x] `make all` passes at end of phase.
- [x] Final report complete and actionable.

## Verification Commands
```bash
make test-scripts
make lint-scripts
make doctor
make lint
make tools-check
make all
./.agents/scripts/.venv/bin/coverage report -m
```

## Test Gate
- Move to `done` only when all final validation commands pass and report evidence is complete.

---
*Template: `.agents/a-docs/templates/task.md`*
