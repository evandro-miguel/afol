---
doc_type: "workbench_plan"
id: "260912_1237_f03-hop-count-ab_plan_01"
session_id: "260912_1237_f03-hop-count-ab"
theme: "f03-hop-count-ab"
status: "closed"
created_at: "2026-09-12T17:37:34.953Z"
updated_at: "2026-09-12T18:14:21.532Z"
roadmap_feature: "F-03"
feature_id: "F-03"
parent_spec: "260716_1234_agent-cli-sequential-verification-runs_spec-child_01"
task_ids: "T-01,T-02,T-03,T-04,T-05,T-06,T-07"
governance_status: "governed"
spec_required: true
pending_spec: false
pending_spec_status: "none"
pending_spec_missing: ""
pending_spec_resolution_hint: "linked to roadmap feature and parent spec"
spec_waiver_reason: ""
closed_at: "2026-09-12T18:14:21.532Z"
---

# Plan: f03-hop-count-ab

Primary metric is **tools per outcome** (hops), not tokens inside one call.

Catalog residual for this governed session is still
`260716_1234_agent-cli-sequential-verification-runs_spec-child_01` (the only
active F-03 child). Experiment intent lives in draft:

- `.afol/adm/specs/260912_1736_agent-cli-hop-count-ab_spec-child_01.md`
- `.afol/adm/specs/260912_1736_agent-cli-hop-count-ab_spec-test_01.md`

Do not activate the hop-count child while the sequential residual is active.

## Sidecars

- brainstorm: not_required
- research: not_required
- explorer_check: not_required
- postmortem: not_required
- spec-test: `260912_1736_agent-cli-hop-count-ab_spec-test_01` (required)

## Marks (A/B)

| Mark | Hypothesis | What changes | Must not break |
| --- | --- | --- | --- |
| M0 | Control | current `./afol` | — |
| M1 | Fast-help | default help = agent fast path only | `qt` / `d -x` / ranges / omit-session still work |
| M2 | Help-parity | `<cmd> --help` == `help <cmd>`, short form first | long flags still work |
| M3 | Collapse-hints | never hint `d` after `e` without `-x`; `e` not required | `e` remains for diagnostics |
| M4 | Actionable status | compact `s` has session id + next command | compact stays ≤200 tok |
| M5 | Bound verify | `vt` without `-S` uses bound session or fail-closed | CI `-S` path unchanged |
| M6 | Alias-disambiguation | `ls` no longer trains a session-list miss | `local-state` still reachable |

Test one mark vs M0. Do not stack. Revert on kill-switch.

## Adverse fixtures (isolated; never this repo's 298 sessions)

A-dirty, A-ambiguous, A-help-flag, A-evidence, A-ls, A-verify, A-compact,
A-qt-pending, A-happy. Definitions in the spec-test.

## Kill-switch

Reject a mark if A-happy hops rise, `done` loses observed evidence, ambiguous
session is not fail-closed, short argv exceeds wb-short gates, p50/p95 miss
100/300 ms on A-happy, one command exceeds 10k output tokens, or mean adverse
hops rise.

## Execution Plan

- T-01: Freeze protocol (draft spec-child + spec-test + this plan).
- T-02: Isolated fixtures + hop oracle under this session (`fixtures/`, `oracle/`).
- T-03: M0 traces for every A-* fixture.
- T-04: M1 then M2 vs M0; revert losers.
- T-05: M3 then M4 vs M0; revert losers.
- T-06: M5 then M6 vs M0; revert losers.
- T-07: Winner table only. Keep product patches that passed kill-switch.

Repo-local `./afol` only. No `$HOME/.local/bin/afol` promotion. No live model
in slice 1.

## Validation

- T-01: spec-test contains M0–M6 and kill-switch.
- T-02: fixtures exist outside `.afol/wb` of this repo root corpus.
- T-03–T-06: per-mark trace files with hops/retry/argv/output/latency.
- T-07: winner table; A-happy still ≤3 hops (`st`, `d -x`, `c`).

## Closure Criteria

- Every task done only with observed evidence.
- Losing marks reverted.
- Sequential F-03 residual left active.
