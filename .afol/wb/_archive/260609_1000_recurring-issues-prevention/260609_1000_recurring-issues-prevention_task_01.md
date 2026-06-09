---
doc_type: task
id: 260609_1000_recurring-issues-prevention_task_01
session: 260609_1000_recurring-issues-prevention
status: in_progress
created_at: '2026-06-09T10:00:00-03:00'
updated_at: '2026-06-09T10:00:00-03:00'
---

# Tasks

## T-01: Session-scoped verify guard [P0, S]
- [ ] Add `verifyAllSessions(root, strict)` to `verify.ts`
- [ ] Refactor `verifyWorkbenchTasks` to delegate root calls to `verifyAllSessions`
- [ ] Add `"session_evidence"` check to `ProjectValidationCheck`
- [ ] Wire check in `validate.ts` command
- [ ] Test: cross-session evidence isolation (overlapping T-01 IDs)

## T-02: Stale session detection [P0, S]
- [ ] Add `detectSessionHealth(root)` to `workbench-index.ts`
- [ ] Add `"session_health"` check to `ProjectValidationCheck`
- [ ] Surface health in `afol status` output
- [ ] Test: duplicate theme detection, stale detection

## T-03: Behavioral template parity test [P1, M]
- [ ] Create `cli/tests/template-behavioral-parity.test.ts`
- [ ] Test: full lifecycle against template copy
- [ ] Test: validation passes against template copy
- [ ] Verify <2s runtime

## T-04: Index drift detection [P1, S]
- [ ] Add `detectIndexDrift(root)` to validate logic
- [ ] Add `"index_drift"` check + `--check-drift` flag
- [ ] Test: stale index detection

## T-05: Toolchain claims validation [P2, S]
- [ ] Add `CLAIMED_TOOLS` + `scanTemplateToolchainClaims()` to template-policy
- [ ] Add `"toolchain_claims"` check
- [ ] Test: missing tool detection
