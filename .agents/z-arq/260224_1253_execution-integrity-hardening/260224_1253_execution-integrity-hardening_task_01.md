---
doc_type: task
id: 260224_1253_execution-integrity-hardening_task_01
theme: execution-integrity-hardening
status: active
owners:
- worker
- tester
created_at: '2026-02-24T12:56:00-03:00'
updated_at: '2026-02-26T23:54:14-03:00'
depends_on:
- 260224_1253_execution-integrity-hardening_plan_01
- 260224_1253_execution-integrity-hardening_plan_02
links:
  plan: 260224_1253_execution-integrity-hardening_plan_02
  spec: 260224_1253_execution-integrity-hardening_spec-lite_01
  report: 260224_1253_execution-integrity-hardening_report_01
---

# Tasks: execution-integrity-hardening (Phase 1-2)

## Phase Goal
- Implement strict WB verification with deterministic checks for evidence, contradictions, and timestamp consistency.

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | worker | Define strict evidence schema and migration policy for legacy sessions. |
| T-02 | done | worker | Implement verify-tasks strict mode and structured failure output. |
| T-03 | done | worker | Validate done-task evidence references in strict mode. |
| T-04 | done | worker | Detect report contradictions in strict mode. |
| T-05 | done | worker | Detect timeline/frontmatter timestamp inconsistencies in strict mode. |
| T-06 | done | tester | Add tests for strict verification pass/fail fixtures. |
| T-07 | done | worker | Add make verify-strict and wire it into validation flow. |
| T-08 | done | tester | Update docs and publish execution report with evidence. (E-20260224155115870450) |

## Acceptance Criteria
- [x] Strict mode fails on synthetic done-without-evidence scenarios.
- [x] Strict mode fails on contradictory report execution claims.
- [x] Strict mode fails on timeline later than updated_at.
- [x] Strict mode passes on valid session fixtures.
- [x] make verify-strict is available and documented.

## Verification Commands
```bash
python3 -m unittest discover -s .agents/scripts/tests -p "test_*.py" -v
./.agents/agents verify-tasks .agents/wb/260224_1253_execution-integrity-hardening --strict
make verify-strict
make doctor
make lint
make test-scripts
```

## Test Gate
- Move tasks to ready_for_test only after implementation and fixture updates are complete.

---
*Template: .agents/a-docs/templates/task.md*
