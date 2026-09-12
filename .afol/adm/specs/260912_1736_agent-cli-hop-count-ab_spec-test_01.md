---
doc_type: spec-test
id: 260912_1736_agent-cli-hop-count-ab_spec-test_01
theme: agent-cli-hop-count-ab
status: draft
owners:
- orchestrator
- tester
workstream_intent: test-strategy
artifact_purpose: A/B hop-count protocol, adverse fixtures, and kill-switch for F-03 marks M0-M6.
created_at: '2026-09-12T17:36:08Z'
updated_at: '2026-09-12T17:36:08Z'
roadmap_feature: F-03
parent_spec: 260521_0030_agent-command-design-system_spec_01
child_spec: 260912_1736_agent-cli-hop-count-ab_spec-child_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  parent: .afol/adm/specs/260521_0030_agent-command-design-system_spec_01.md
risk_level: high
---

# SPEC TEST: hop-count A/B under adverse fixtures

## Intent

- Journey: an agent completes governed work with the fewest AFOL tool calls.
- Why now: token-per-call benches pass while round-trips still fail the product.
- Related feature: `F-03`
- Parent spec: `260521_0030_agent-command-design-system_spec_01`

## Canonical Position

- Strategy artifact, not test code. The hop oracle and fixtures are the
  executable layer and live in the workbench session until a mark wins.

## Journey

- Primary user: coding agent driving `./afol` (repo-local).
- Entry: a frozen fixture + a scripted policy (not a live model in slice 1).
- Exit: journey success predicate true, or hop cap reached (fail).

## Hypotheses and marks

| Mark | Hypothesis | Change under test | Predicted hop effect |
| --- | --- | --- | --- |
| M0 | Control | current CLI, no patch | baseline |
| M1 | Fast-help | default `afol help` lists only the agent fast path; full catalog behind `help --for planning` / `--verbose` | fewer wrong-verb retries; risk +1 `help <cmd>` on rare verbs |
| M2 | Help-parity | `afol <cmd> --help` equals `afol help <cmd>` and leads with omit-session short form | fewer `--help` then rewrite hops |
| M3 | Collapse-hints | after `e`, hint is `d T-xx -x`; agent docs do not list `e` as a required step | `e`→`d`(fail)→`d -x` (3) becomes `d -x` (1) |
| M4 | Actionable status | compact `s` prints session id when resolved and a copy-paste next command | removes `s` then `s -j` |
| M5 | Bound verify | `vt`/`vf` without `-S` uses active/bound session; if none, fail closed with the exact `-S` command | removes scan-all then retry |
| M6 | Alias-disambiguation | colliding `ls` either warns with the exact next command in one line that still completes the intent, or `ss ls` is what help/fast-path teach with no `ls` as "list" | removes `ls` then `ss` |

Do not stack marks in one trace. Measure M1..M6 each against M0.

## Adverse fixtures

Each fixture is an isolated temp project bootstrapped from the template, never
this repository's `.afol/wb`.

| Id | Setup | Success predicate |
| --- | --- | --- |
| A-dirty | ≥50 closed sessions, no `.active_session` | `s` then start+done+close one new task |
| A-ambiguous | one open session, two `pending` tasks | `st` without task id fails; `st T-01` then `d -x` then `c` |
| A-help-flag | bound session, pending T-01 | policy is allowed only `start --help` then one write command |
| A-evidence | bound session, in_progress T-01 | policy follows `e` then `d` (no `-x`) then recovery |
| A-ls | no active session | policy runs `afol ls` expecting session list, then recovers |
| A-verify | ≥5 open sessions, no active | `vt --strict` then recover to one session |
| A-compact | bound session, in_progress T-01 | JSON flags forbidden; close from compact stdout only |
| A-qt-pending | no `-F`/`-P` | `qt` completes and next_command is usable in one follow-up |
| A-happy | bound session, one pending task | `st T-01` → `d T-01 -x true` → `c` (regression guard) |

## Scripted policy (slice 1)

No live model. The oracle feeds the policy the last compact stdout/stderr and
the mark's help text, then the policy emits the next argv from a frozen table:

1. If success predicate already holds, stop.
2. Else take the documented next command from stdout (`hint=`, `SAFE_NEXT_ACTION`, `NEXT:`).
3. Else take the mark's help fast path for the journey.
4. Else one discovery command (`help`, `help start`, or `s`), then retry.
5. Cap 8 hops. Excess is a failed trace.

Slice 2 (optional, later): one live-agent receipt per mark on A-dirty + A-happy
only. Inconclusive harness failures are not passes.

## Kill-switch (mark loses)

Reject the mark if any is true vs M0 on the same fixture class:

1. A-happy hops increase.
2. `done` can complete without observed passing evidence.
3. Ambiguous session no longer fail-closed.
4. Short-form argv exceeds current wb-short gates (`st` 16, `d -x "echo ok"` 32, `c` 12).
5. p50 > 100 ms or p95 > 300 ms for `s`/`st`/`d`/`c` on A-happy.
6. A single default command emits >10k output tokens.
7. Mean hops across A-\* rise, even if one fixture improves.

## Win rule

A mark wins if A-happy hops do not rise **and** mean hops across adverse
fixtures fall **and** no kill-switch fires. Ties keep M0.

## Recommended Technology

- Primary: Bun scripted hop oracle + isolated fixture dirs.
- Not Playwright. Not `validate:release`. Not this repo's 298 sessions.
- Repo-local `./afol` or `bun run kernel --` only.

## Evidence Plan

- Per mark per fixture: hops, retry_count, argv_chars max, output_bytes max,
  duration_ms, exit sequence, kill-switch boolean.
- Store traces under the workbench session. Do not dump full stdout into the
  report.
- Pass: winner table complete; rejected marks reverted; A-happy still 3 hops
  or fewer (`st`, `d -x`, `c`).

## Acceptance

- [ ] Fixtures A-* exist and are isolated
- [ ] M0 traces recorded
- [ ] M1–M6 each have a kill-switch result
- [ ] Product code retains only winning marks
