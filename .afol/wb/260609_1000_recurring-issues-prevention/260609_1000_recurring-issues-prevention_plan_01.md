---
doc_type: plan
id: 260609_1000_recurring-issues-prevention_plan_01
session: 260609_1000_recurring-issues-prevention
status: in_progress
created_at: '2026-06-09T10:00:00-03:00'
updated_at: '2026-06-09T10:00:00-03:00'
feature_id: F-18
parent_spec: docs/arc/SPECS/260521_0110_validation-ci-and-benchmarks_spec_01.md
---

# Plan: Recurring Issues Prevention

## Context

Retrospective of 28 completed workbench sessions identified 5 recurring problems.
RULE-008/009/010, ADR-001/002, and 8 lessons were created. Now we need **code
enforcement** — not just documentation — to prevent recurrence.

## Root Cause Analysis

| Issue | Root Cause |
|-------|-----------|
| Evidence cross-session | `verifyWorkbenchTasks` at root scans all sessions without per-session isolation |
| Duplicate stale sessions | No dedup at creation, no detection of stale in-progress state |
| Generated docs drift | `afol validate` rebuilds indexes creating file deltas indistinguishable from intentional changes |
| Template parity assumed | Template policy checks file presence, not behavioral correctness |
| Aspirational toolchain claims | No gate verifies documented tools exist in the environment |

## Priority Order

| # | Fix | Impact | Effort | Priority |
|---|-----|--------|--------|----------|
| F1 | Session-scoped verify guard | HIGH | S | P0 |
| F2 | Stale session detection in validate | HIGH | S | P0 |
| F3 | Behavioral template parity test | HIGH | M | P1 |
| F4 | Index drift detection | MEDIUM | S | P1 |
| F5 | Toolchain claims validation | MEDIUM | S | P2 |

## Dependencies

```
F1 (session-scoped verify) ← independent, do first
F2 (stale session detection) ← independent, do first
F3 (template parity) ← depends on F1 (evidence scoping must be correct)
F4 (index drift) ← independent
F5 (toolchain claims) ← independent
```

---

## F1: Session-Scoped Verify Guard (P0)

**Files:**
- `cli/services/workbench/verify.ts` — add `verifyAllSessions()` that iterates per-session
- `cli/services/project/validate.ts` — add `session_evidence` check
- `cli/commands/validate.ts` — wire new check
- `cli/tests/` — cross-session evidence isolation test

**Changes:**
1. Add `verifyAllSessions(root, strict)` that discovers sessions via workbench index and calls `verifyWorkbenchTasks` per session.
2. In `verifyWorkbenchTasks`, detect root-level call and delegate to `verifyAllSessions`.
3. Add `"session_evidence"` check ID to `ProjectValidationCheck`.
4. Test: two sessions with overlapping task IDs (T-01), evidence in A only, verify B reports missing evidence.

**Acceptance:**
- Cross-session evidence isolation test passes
- `afol validate` includes `session_evidence` check
- All existing tests pass

---

## F2: Stale Session Detection (P0)

**Files:**
- `cli/services/local-state/workbench-index.ts` — add `detectSessionHealth()`
- `cli/services/project/validate.ts` — add `session_health` check
- `cli/commands/status.ts` — surface session health
- `cli/tests/` — session health tests

**Changes:**
1. Add `detectSessionHealth(root)`: detect duplicate themes, detect stale in-progress (>7 days).
2. Add `"session_health"` check — fatal for duplicate in-progress, warning for stale.
3. Surface in `afol status`: session count, open count, stale count.

**Acceptance:**
- `afol validate` reports duplicate active sessions as failure
- `afol validate` reports stale sessions as warning
- Test: two sessions with same theme detected

---

## F3: Behavioral Template Parity Test (P1)

**Files:**
- `cli/tests/template-behavioral-parity.test.ts` — new file

**Changes:**
1. Copy `src/project-template/` to temp directory.
2. Run full lifecycle: `newWorkstream → startTask → recordEvidence → doneTask → closeSession`.
3. Run `validateProjectStructure` against temp dir.
4. Verify evidence ledger written correctly.

**Acceptance:**
- Full lifecycle runs against template copy without errors
- Test runs in CI (<2s target)

---

## F4: Index Drift Detection (P1)

**Files:**
- `cli/services/project/validate.ts` — add `index_drift` check
- `cli/commands/validate.ts` — add `--check-drift` flag
- `cli/tests/` — drift detection test

**Changes:**
1. Add `detectIndexDrift(root)`: read current indexes, rebuild in memory, compare.
2. Add `"index_drift"` check — non-fatal by default, fatal with `--check-drift`.
3. Recommend `afol validate --check-drift` in CI.

**Acceptance:**
- Stale index detected by `afol validate --check-drift`
- Test: create stale index, verify detection

---

## F5: Toolchain Claims Validation (P2)

**Files:**
- `cli/schemas/template-policy.ts` — add `scanTemplateToolchainClaims()`
- `cli/services/project/validate.ts` — add `toolchain_claims` check
- `cli/tests/template-policy.test.ts` — toolchain claims test

**Changes:**
1. Add `CLAIMED_TOOLS` list (`["bun", "afol"]`).
2. `scanTemplateToolchainClaims()`: check instruction files for tool references, verify availability.
3. Add `"toolchain_claims"` check — non-fatal by default.

**Acceptance:**
- `afol validate` verifies `bun` and `afol` available
- Test: detect missing tool

---

## Risks

| Risk | Mitigation |
|------|-----------|
| ValidationCheck union grows large | Acceptable at 5 new IDs; refactor if >25 |
| F3 parity test slow | Gate behind existence check; target <2s |
| F4 reads indexes twice | Indexes are small JSON; acceptable |
| F5 env-dependent | Non-fatal by default; explicit flag for fatal |

## Rollout

All changes are additive. No breaking changes to CLI args or JSON output.
F1+F2 ship together. F3 after F1. F4+F5 independent.
