---
doc_type: task
id: 260224_1253_execution-integrity-hardening_task_01
theme: execution-integrity-hardening
status: active
owners:
- worker
- tester
created_at: '2026-02-24T12:56:00-03:00'
updated_at: '2026-02-24T13:07:03-03:00'
depends_on:
- 260224_1253_execution-integrity-hardening_plan_01
links:
  plan: 260224_1253_execution-integrity-hardening_plan_01
  spec: 260224_1253_execution-integrity-hardening_spec-lite_01
---

# Tasks: execution-integrity-hardening (Phase 1-2)

## Phase Goal
- Implement strict WB verification with deterministic checks for evidence, contradictions, and timestamp consistency.

## Task List
- [ ] T-01 Define strict evidence schema and migration policy for legacy sessions.
- [ ] T-02 Implement verify-tasks strict mode and structured failure output.
- [ ] T-03 Validate done-task evidence references in strict mode.
- [ ] T-04 Detect report contradictions in strict mode.
- [ ] T-05 Detect timeline/frontmatter timestamp inconsistencies in strict mode.
- [ ] T-06 Add tests for strict verification pass/fail fixtures.
- [ ] T-07 Add make verify-strict and wire it into validation flow.
- [ ] T-08 Update docs and publish execution report with evidence.

## State Board
| Task | Checklist | State | Owner | Notes |
|------|----------:|-------|-------|-------|
| T-01 | - [ ] | pending | worker | Define fields and backward-compat policy. |
| T-02 | - [ ] | pending | worker | Add strict CLI path and output contract. |
| T-03 | - [ ] | pending | worker | Enforce evidence linkage for done tasks. |
| T-04 | - [ ] | pending | worker | Add contradiction rule set and checks. |
| T-05 | - [ ] | pending | worker | Add temporal coherence checks. |
| T-06 | - [ ] | pending | tester | Add deterministic fixtures and assertions. |
| T-07 | - [ ] | pending | worker | New make target + pipeline integration. |
| T-08 | - [ ] | pending | tester | Final report and residual risks. |

## Acceptance Criteria
- [ ] Strict mode fails on synthetic done-without-evidence scenarios.
- [ ] Strict mode fails on contradictory report execution claims.
- [ ] Strict mode fails on timeline later than updated_at.
- [ ] Strict mode passes on valid session fixtures.
- [ ] make verify-strict is available and documented.

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
