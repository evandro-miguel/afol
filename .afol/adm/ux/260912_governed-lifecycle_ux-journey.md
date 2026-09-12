---
doc_type: ux-journey
id: 260912_governed-lifecycle_ux-journey
theme: governed-lifecycle
status: active
owners:
- orchestrator
created_at: '2026-09-12T20:00:00Z'
updated_at: '2026-09-12T20:00:00Z'
roadmap_feature: F-03
parent_spec: 260716_1234_agent-cli-sequential-verification-runs_spec-child_01
---

# UX Journey: Governed lifecycle n/st/d -x/c

## Purpose

- User or agent: delegated agent with an active or bound workbench session
- Goal: finish one governed task with observed evidence, then close
- Context: work needs a session and State Board; omit `-S` when bound
- Intent: `n` → `st T-01` → `d T-01 -x "<real>"` → `c` (3 hops after create). `e` is diagnostic only

## Entry And Exit

- Entry point: `afol n <theme> -F <F-id> -P <spec-id> -t "<task>"`
- Success exit: T-01 is `done` with observed evidence and the session is closed
- Recovery exit: copy-paste the error `hint=` command; never authorize with `true`

## Flow

1. Create a governed session.
   - Information shown: session id, T-01 pending, hint `afol st T-01`
   - User or agent decision: start now, or resolve governance if `pending_spec` matters
   - AFOL command/tool: `afol n <theme> -F <F-id> -P <spec-id> -t "<task>"`
   - System state: State Board T-01 `pending`; session active/bound
   - Possible failure: `pending_spec` (warning, not a hard block); CI/multi-agent missing `-S`
   - Recovery: `afol gov rs -F <F-id> -P <spec-id>` or `afol gov rs --no-spec-required -r "<reason>"`. Ambiguous: `afol st -S <session-id> -T T-01`
2. Start the task before product edits.
   - Information shown: T-01 `in_progress`, hint `afol d T-01 -x "<cmd>"`
   - User or agent decision: edit, then pick a real check (`echo hop-ok`, `bun test`)
   - AFOL command/tool: `afol st T-01`
   - System state: State Board T-01 `in_progress`
   - Possible failure: missing `-S` when the session is ambiguous; task not found
   - Recovery: `afol s`; `afol catchup --fix`; `afol st -S <session-id> -T T-01`
3. Complete with argv verification (`d -x`).
   - Information shown: observed evidence, T-01 `done`, hint `afol c`
   - User or agent decision: close, or start the next leftover task
   - AFOL command/tool: `afol d T-01 -x "echo hop-ok"`
   - System state: State Board T-01 `done`; evidence ledger observed success
   - Possible failure: missing `-x`; `-x true` / `:` no-op; non-zero check
   - Recovery: `afol d T-01 -x "<real cmd>"`. Leftover pending: `afol st T-02` then `afol d T-02 -x "<cmd>"`
4. Close the session.
   - Information shown: compact close summary
   - User or agent decision: stop, or open a new session
   - AFOL command/tool: `afol c`
   - System state: session `closed`; no open State Board rows
   - Possible failure: open tasks on close; corrupt context binding
   - Recovery: `afol d T-01 -x "<cmd>"` then `afol c`. Carry only: `afol c --carry-open --reason "<text>"`. Binding: `afol catchup --fix` or `afol c -S <session-id>`

## Expected Result

- Output: compact success plus next-command hints (`st` after `n`, `d -x` after `st`, `c` after `d`)
- Durable state change: State Board pending → in_progress → done; observed evidence; session closed
- Warning or review prompt: `pending_spec` and hygiene warn but do not block; hard blocks are no-op, missing `-x`, open tasks, ambiguous session
- Token/output budget: hot path p50 ≤100ms; compact success ≤200 tok; default stdout never >5k

## States And Recovery

- Default: `afol st T-01` → `afol d T-01 -x "<cmd>"` → `afol c`
- Loading or in-progress: keep T-01 `in_progress`; retry `afol d T-01 -x "<cmd>"`
- Empty or no results: `afol s`; if none, `afol n <theme> -t "<task>"`
- Error: `true` is rejected; retry `afol d T-01 -x "echo hop-ok"`
- Partial failure: leftover pending on `c`; repair with `afol st T-02` then `afol d T-02 -x "<cmd>"` then `afol c`
- Permission denied or approval required: keep preview; agents must not use `--test-shell`
- Stale state: `afol catchup --fix`; retry with `-S <session-id>` if still invalid
- Success: T-01 `done`, session closed, evidence observed
- First use: prefer `afol qt` for one micro task; use this journey for multi-hop work
- Returning user: omit `-S` when bound; `-S` only for CI/multi-agent

## Evidence

- Scripted scenario: isolated tmp fixture; `bun test` for n/st/d hints, no-op reject, leftover pending close
- Live-agent scenario: `./afol n` / `st` / `d -x` / `c` with a real check, not `true`
- Benchmark pack: workbench-parity / hop-residue when present
- Report or workbench evidence: session `260912_1420_f03-lifecycle-align` T-03 `d -x`

## Metrics

- Completion criterion: 3 hops after session exists; T-01 `done`; session closed
- Error/retry criterion: `true`, missing `-x`, missing `-S` when ambiguous, open-task close, `pending_spec` each name a copy-paste repair
- User effort or latency criterion: p50 ≤100ms; agent writes `st` / `d -x` / `c`
- Support or confusion signal: docs teaching `e` or `--session` on the happy path
- Quality or review signal: `afol ux validate` reports no missing fields on this journey

## Acceptance

- [x] Primary actor and goal are explicit
- [x] Steps, states, failures, and recovery are explicit
- [x] Expected AFOL tools are named
- [x] Expected output and durable state change are explicit
- [x] Evidence path is explicit

---

*Template: `docs/templates/ux-journey.md`*
