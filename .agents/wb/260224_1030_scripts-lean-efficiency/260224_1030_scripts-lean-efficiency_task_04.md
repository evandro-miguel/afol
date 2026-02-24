---
doc_type: task
id: 260224_1030_scripts-lean-efficiency_task_04
theme: scripts-lean-efficiency
status: active
owners:
- tester
- worker
created_at: '2026-02-24T10:30:20-03:00'
updated_at: '2026-02-24T12:54:13-03:00'
depends_on:
- 260224_1030_scripts-lean-efficiency_task_03
links:
  plan: 260224_1030_scripts-lean-efficiency_plan_01
  spec: 260224_1030_scripts-lean-efficiency_spec-lite_01
---

# Tasks: Phase 4 - Testing, Gates, Docs, and Release Readiness

## Phase Goal
- Finalize confidence gates, document outcomes, and prepare safe execution/merge readiness.

## Task List
- [ ] T-01 Add integration tests for critical workflows (`new --quick`, `wb-update task`, `doctor`, `lint`, `tools`).
- [ ] T-02 Expand tests for refactored hotspot functions.
- [ ] T-03 Re-run productive-code coverage and compare against baseline.
- [ ] T-04 Define quality gate thresholds (complexity and coverage) and where they run.
- [ ] T-05 Update standards/usage docs with the final command surface.
- [ ] T-06 Update agentic docs and references impacted by refactor.
- [x] T-07 Run full regression (`make all`) and parity matrix final validation.
- [ ] T-08 Finalize report with evidence, residual risks, and recommended follow-ups.

## State Board
| Task | Checklist | State | Owner | Notes |
|------|----------:|-------|-------|-------|
| T-01 | - [ ] | pending | tester | Integration safety net for critical flows. |
| T-02 | - [ ] | pending | tester | Ensure hotspot changes are covered. |
| T-03 | - [ ] | pending | tester | Baseline vs final coverage delta. |
| T-04 | - [ ] | pending | orchestrator | Guardrails to prevent backslide. |
| T-05 | - [ ] | pending | worker | Docs match real behavior. |
| T-06 | - [ ] | pending | worker | Keep agentic docs aligned. |
| T-07 | - [x] | done | tester | make all passed - existing tests. |
| T-08 | - [ ] | pending | orchestrator | Report updated with honest status. |

## Acceptance Criteria
- [ ] Integration tests cover critical command workflows.
- [ ] Coverage improved against baseline with documented evidence.
- [ ] Quality gates defined and documented.
- [x] `make all` passes at end of phase (existing gates).
- [ ] Final report complete and actionable.

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
