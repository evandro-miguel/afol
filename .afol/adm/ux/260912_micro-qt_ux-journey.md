---
doc_type: ux-journey
id: 260912_micro-qt_ux-journey
theme: micro-qt
status: active
owners:
- orchestrator
created_at: '2026-09-12T20:00:00Z'
updated_at: '2026-09-12T20:00:00Z'
roadmap_feature: F-03
parent_spec: 260716_1234_agent-cli-sequential-verification-runs_spec-child_01
---

# UX Journey: Micro quick-task qt

## Purpose

- User or agent: delegated agent doing one-shot micro work
- Goal: create, start, verify once, record observed evidence, and close in one hop
- Context: a single real check is enough; omit `-S`; do not teach `e`
- Intent: `afol qt <theme> -t "<task>" -c "<real>"`. Repeat `-t` for a shared `-c`

## Entry And Exit

- Entry point: `afol qt <theme> -t "<task>" -c "<real cmd>"`
- Success exit: tasks `done` with observed evidence and the session closed in one command
- Recovery exit: session left open after a failed check; retry `afol d T-01 -x "<corrected>"` or mark `afol tr T-01 --state problem -r "<reason>"`

## Flow

1. Choose micro `qt` instead of `n`/`st`/`d`/`c`.
   - Information shown: this journey vs governed 3-hop path
   - User or agent decision: one shared check → `qt`; multi-hop edits → governed journey
   - AFOL command/tool: `afol help qt`
   - System state: no session yet
   - Possible failure: using `qt` when several distinct verifications are required
   - Recovery: switch to `afol n <theme> -t "<task>"` then `st` / `d -x` / `c`
2. Run one-shot lifecycle with a real check.
   - Information shown: compact create/start/verify/close result; `pending_spec` warning if `-F`/`-P` omitted
   - User or agent decision: pass `-F`/`-P` when the catalog is known, or continue with the warning
   - AFOL command/tool: `afol qt <theme> -t "<task>" -c "echo hop-ok"`
   - System state: State Board T-01 pending → in_progress → done; session closed
   - Possible failure: missing `-c`; `-c true` / `:` no-op; check non-zero; missing `-S` is not required here
   - Recovery: `afol qt <theme> -t "<task>" -c "<real cmd>"`. Failed mid-flight: `afol d T-01 -x "<corrected>"` then `afol c`, or `afol tr T-01 --state problem -r "<reason>"`
3. Multi-task micro with one shared check.
   - Information shown: T-01..Tn verified once; each task gets observed evidence
   - User or agent decision: keep one `-c`; do not invent per-task `e` receipts
   - AFOL command/tool: `afol qt <theme> -t "a" -t "b" -c "echo hop-ok"`
   - System state: all listed tasks `done`; session closed
   - Possible failure: no-op `-c`; leftover open task if verify fails after start
   - Recovery: `afol d T-01..T-02 -x "<real cmd>"` then `afol c`. `pending_spec`: `afol gov rs -F <F-id> -P <spec-id>` (close is still allowed)
4. Inspect after success or warning.
   - Information shown: `afol s` compact status; hygiene/`pending_spec` warnings
   - User or agent decision: resolve spec later; do not reopen a closed micro session
   - AFOL command/tool: `afol s`
   - System state: closed session remains evidence; warnings are advisory
   - Possible failure: treating `pending_spec` as a hard block; teaching `e` as required
   - Recovery: `afol gov rs --no-spec-required -r "<reason>"` if a waiver is wanted; keep `e` diagnostic only

## Expected Result

- Output: one compact success (or a named failure with `hint=`); next command after success is `afol status`
- Durable state change: session created and closed; State Board tasks `done`; observed evidence per task
- Warning or review prompt: `pending_spec` warns and still closes; no-op `-c true` is a hard fail and must not leave silent success
- Token/output budget: 1 hop; compact success ≤200 tok; default stdout never >5k

## States And Recovery

- Default: `afol qt <theme> -t "<task>" -c "echo hop-ok"`
- Loading or in-progress: if verify is still running, wait; do not start a second `qt` on the same theme
- Empty or no results: missing `-c` fails; retry `afol qt <theme> -t "<task>" -c "<real cmd>"`
- Error: `-c true` is a shell no-op; retry with `echo hop-ok` or `bun test`
- Partial failure: session left open; `afol d T-01 -x "<corrected>"` then `afol c`
- Permission denied or approval required: keep preview; agents must not use `--test-shell`
- Stale state: `afol catchup --fix`; ambiguous later hops use `-S <session-id>`
- Success: tasks `done`, session closed, evidence observed
- First use: this is the default micro path; skip `n`/`st`/`d`/`c`
- Returning user: add `-F`/`-P` when known; otherwise continue with `pending_spec` warnings

## Evidence

- Scripted scenario: isolated tmp fixture; `bun test` that `qt -c true` fails before close and does not silent-succeed
- Live-agent scenario: `./afol qt <theme> -t "<task>" -c "echo hop-ok"`
- Benchmark pack: workbench-parity / hop-residue when present
- Report or workbench evidence: session `260912_1420_f03-lifecycle-align` T-03 `d -x`

## Metrics

- Completion criterion: 1 hop; tasks `done`; session closed
- Error/retry criterion: `true` no-op, missing `-c`, failed check, `pending_spec` each name a copy-paste repair
- User effort or latency criterion: p50 ≤100ms; agent writes one `qt` line
- Support or confusion signal: docs that require `e` or `--session` for micro work
- Quality or review signal: `afol ux validate` reports no missing fields on this journey

## Acceptance

- [x] Primary actor and goal are explicit
- [x] Steps, states, failures, and recovery are explicit
- [x] Expected AFOL tools are named
- [x] Expected output and durable state change are explicit
- [x] Evidence path is explicit

---

*Template: `docs/templates/ux-journey.md`*
