# Report: 260829_2215_comprehensive-usage-audit

## Summary

closed: 4 tasks; evidence: 8 observed, 0 failed

## Tasks

- T-01: done
- T-02: done
- T-03: done
- T-04: done

## Evidence

- T-01 attempt=1 evidence_id=E-20260829230245528-add2d0 authorizing: passed (rg -q '^evolve\t0\t' .tmp/usage-audit/help-matrix.tsv; exit_code=0)
- T-02 attempt=1 evidence_id=E-20260829230248582-e7f118 authorizing: passed (jq -e '(.data.projects | length) == 4' .tmp/usage-audit/fleet-check.json; exit_code=0)
- T-03 attempt=1 evidence_id=E-20260829230251585-8f9c32 authorizing: passed (rg -q 'cli/services/evolution/db.ts' .tmp/usage-audit/public-diff.txt; exit_code=0)
- T-04 attempt=1 evidence_id=E-20260829230254925-5afed7 authorizing: passed (jq -e '(.findings == .data.findings) and ((.findings | length) == 136)' .tmp/usage-audit/downstream/invest/health.out; exit_code=0)
- T-01 attempt=1 evidence_id=E-20260830094906992-2f7f83 observed: passed (revision, audit summary, private allowOpen, and health-risk anchors; exit_code=0)
- T-02 attempt=1 evidence_id=E-20260830094915513-8c6fae observed: passed (revision, 51-row help matrix, and four-project fleet classifications; exit_code=0)
- T-03 attempt=1 evidence_id=E-20260830094922114-e0fd3b observed: passed (private/public revisions, diff anchor, and Bun 1.3.14/1.4.0 benchmark outcomes; exit_code=0)
- T-04 attempt=1 evidence_id=E-20260830095046668-30b540 observed: passed (revision, corrected severity/findings, health duplication, and candidate verdict anchors; exit_code=0)

## Corrected audit findings

Audit source revisions: private factory `4db57ef0b8f3cd73325ee1846cbfbb3a8fbf8271`; canonical public engine `09fd89fda14c40c5a4fd8a3160510e22670ec3bc`.

- T-01 proof observed 51/51 top-level help commands, private `allowOpen` support for the terminal transition path, and the static health-output risk. Gap: the public engine still has the unconditional open-session rejection.
- T-02 proof observed the 51-row command matrix and four-project fleet trial (`healthy`, two `update-conflicted`, `validation-blocked`). Gaps: stale indexes plus RAG/Agent Memory evidence blockers and downstream update conflicts.
- T-03 proof observed the private/public revision split, an evolution DB diff, and mutation-safety results of 5/5 on Bun 1.3.14 versus 5/5 profile-incompatible on Bun 1.4.0. Gap: no canonical merge or publication was performed.
- T-04 synthesis remains NO-GO for canonical parity/reproducible release readiness: Invest health produced 136 warnings in 41,463 chars (about 10,366 tokens), scanner paths were unset, and binary distribution issue #101 remains open. Public audits and informative security scans passed.

## Severity resolution

Issue #96 behavior is **High**: the canonical public engine rejects terminal open-session admission. The **Critical** finding is the private/public divergence that leaves the fix only in the private revision and can mask that High issue. These are separate severities; #96 is no longer labeled both High and Critical.
