---
doc_type: "workbench_task"
id: "260912_1237_f03-hop-count-ab_task_01"
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

# Tasks: f03-hop-count-ab

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | worker | Freeze hop-count A/B protocol, marks M0-M6, and kill-switch attempt=1 |
| T-02 | done | worker | Build isolated adverse fixtures without mutating this repo workbench attempt=1 |
| T-03 | done | worker | Measure M0 control hop traces on all adverse fixtures attempt=1 |
| T-04 | done | worker | Test help-surface marks M1 and M2 against M0 with kill-switch attempt=1 |
| T-05 | done | worker | Test collapse and status marks M3 and M4 against M0 with kill-switch attempt=1 |
| T-06 | done | worker | Test verify-bound and alias marks M5 and M6 against M0 with kill-switch attempt=1 |
| T-07 | done | worker | Select winners that reduce hops without reliability, argv, or latency regression attempt=3 |

## Governance Context

- Roadmap feature: F-03
- Catalog residual (session parent_spec): `260716_1234_agent-cli-sequential-verification-runs_spec-child_01`
- Draft experiment child: `260912_1736_agent-cli-hop-count-ab_spec-child_01`
- Spec-test: `260912_1736_agent-cli-hop-count-ab_spec-test_01`
- Primary metric: hops (AFOL invocations until journey success, including retries)

## Acceptance commands

- T-01: `rg -n '^\\| M[0-6] ' .afol/adm/specs/260912_1736_agent-cli-hop-count-ab_spec-test_01.md`
- T-02: oracle + fixtures exist under this session and not against repo `.afol/wb` corpus
- T-03: M0 traces for A-dirty, A-ambiguous, A-help-flag, A-evidence, A-ls, A-verify, A-compact, A-qt-pending, A-happy
- T-04..T-06: each mark has kill-switch pass/fail vs M0
- T-07: winner table; losers reverted; A-happy hops ≤ 3
