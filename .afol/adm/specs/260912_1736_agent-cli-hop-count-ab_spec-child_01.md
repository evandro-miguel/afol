---
doc_type: spec-child
id: 260912_1736_agent-cli-hop-count-ab_spec-child_01
theme: agent-cli-hop-count-ab
status: draft
owners:
- orchestrator
workstream_intent: feature
artifact_purpose: Define hop-count A/B marks and adverse fixtures for F-03 without activating a second residual child.
created_at: '2026-09-12T17:36:08Z'
updated_at: '2026-09-12T17:36:08Z'
roadmap_feature: F-03
spec_role: child
parent_spec: 260521_0030_agent-command-design-system_spec_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  parent: .afol/adm/specs/260521_0030_agent-command-design-system_spec_01.md
  related:
  - .afol/adm/specs/260712_agent-cli-extreme-ease-latency-write-tokens_spec-child_01.md
  - .afol/adm/specs/260716_1234_agent-cli-sequential-verification-runs_spec-child_01.md
  - .afol/adm/specs/260521_0110_validation-ci-and-benchmarks_spec_01.md
risk_level: high
---

# SPEC CHILD: agent CLI hop-count A/B under adverse fixtures

## Intent

- Outcome: F-03 is scored by **tools per outcome**, not only tokens inside one
  command. Six reversible marks are measured against control on adverse
  fixtures. A mark ships only if it cuts hops without harming the already-correct
  `st → d -x → c` path, evidence gates, fail-closed session resolution, argv
  length, or hot-path latency.
- Roadmap feature: `F-03`.
- Parent spec: `260521_0030_agent-command-design-system_spec_01`.
- This child stays **draft**. F-03 already has one active residual
  (`260716_1234_agent-cli-sequential-verification-runs_spec-child_01`). Do not
  activate this child until that residual is final.

## Decision intake

```text
user: agents waste round-trips, not only tokens per call
pain: 51-command help, dual --help, e then d, vt scans all WB, ls collision, compact s omits session id
observable_outcome: hop traces per journey; winner table; no reliability regression
constraints: isolated fixtures; no global afol install; keep qt / d -x / ranges / omit-session
non_goals: live-model runs in the first slice; shrinking collapse verbs; reopening F-03
reversibility: each mark is a patch or simulated policy that reverts if kill-switch fires
first_slice: protocol + fixtures + M0 baseline, then marks M1-M6 with kill-switch
challenge: smaller help might add help <cmd> hops; compact status might force s -j; rival is "keep 51 commands so agents find verbs without a second help"
```

## Problem

F-03 already collapsed argv and stdout. Live audit showed extra **tool calls**
to finish one job: wrong help text, declared evidence that cannot authorize
`done`, verify-all-sessions, colliding `ls`, and compact status without a
session id. Cutting catalog size is not automatically a win if the agent then
calls `help` twice.

## Primary metric

`hops` = AFOL CLI invocations until the journey's success predicate, including
failed retries and discovery (`help`, `--help`, `s -j`).

Secondary (must not regress vs M0 on the same fixture):

- happy-path hops for `st T-01` → `d T-01 -x "<cmd>"` → `c`
- observed-evidence gate still required for `done`
- ambiguous session still fail-closed
- short-form `argv_chars` within current wb-short gates
- p50 ≤ 100 ms and p95 ≤ 300 ms for `s` / `st` / `d` / `c` on the same class
- default stdout warn >5k tokens, fail >10k

## Marks

Control is **M0** (current CLI). Marks M1–M6 are independent hypotheses.
Test one mark at a time against M0. Do not stack marks until each has its own
trace.

## Boundaries

- In scope: hop oracle, isolated adverse fixtures, help/hint/status/verify/alias
  marks, winner table, keep-or-revert.
- Out of scope: removing `qt`, `d -x`, ranges, or omit-session; activating this
  child while the sequential residual is active; promoting `$HOME/.local/bin/afol`;
  live-model harness in the first slice; Evolution/template shrinkage as a mark.
- Isolation: fixtures live under the workbench session or `tmp/`; never use this
  repository's 298 workbench sessions as the hop corpus.

## Acceptance

- M0 traces exist for every adverse fixture.
- Each mark has hops, argv, output tokens, latency, and kill-switch result.
- A mark that increases happy-path hops or breaks a reliability gate is rejected
  even if adverse-set mean hops fall.
- Winning marks, if any, are listed with evidence ids before product patches stay.
