---
doc_type: spec-test
id: 260726_event-ledger-durability_spec-test_01
theme: event-ledger-durability
status: final
owners:
- orchestrator
workstream_intent: remediation
artifact_purpose: Define adversarial focused proof for the shared AFOL event ledger.
created_at: '2026-07-26T20:28:59Z'
updated_at: '2026-07-26T20:28:59Z'
roadmap_feature: F-29
parent_spec: 260715_afol-1-0-linux-wsl-finalization_spec_01
child_spec: 260726_event-ledger-durability_spec-child_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  child: .afol/adm/specs/260726_event-ledger-durability_spec-child_01.md
  plan: .afol/wb/260726_1730_event-ledger-durability/260726_1730_event-ledger-durability_plan_01.md
  task: .afol/wb/260726_1730_event-ledger-durability/260726_1730_event-ledger-durability_task_01.md
  report: .afol/wb/260726_1730_event-ledger-durability/260726_1730_event-ledger-durability_report_01.md
risk_level: high
---

# SPEC TEST: Event Ledger Durability

## Intent

- Journey or behavior under test: durable concurrent append and fail-closed
  consumption of the shared workbench/telemetry JSONL ledger
- Why this test strategy is needed now: a quota-induced partial append exposed
  that writer failures can leave a corrupt tail and current consumers can skip
  malformed records
- Related feature: `F-29`
- Parent spec: `260715_afol-1-0-linux-wsl-finalization_spec_01`

## Journey

- Primary user or operator: AFOL agent recording lifecycle evidence
- Entry point: workbench/telemetry append, project validation, local-state
  rebuild
- Exit condition: a valid event is durable, or the operation fails without
  changing the prior ledger and without deriving state from corrupt input

## Clicks and Commands

- UI click path: not applicable
- CLI or API command path:
  1. Run focused event-ledger and existing consumer tests with `bun test`.
  2. Run `bun run typecheck` and narrow Biome checks.
- Inputs and fixtures:
  - Real small temporary files with injectable synchronous I/O operations
  - Partial write followed by `EDQUOT`
  - Initial and rollback `fsync` failures
  - Rollback truncation failure
  - Short and zero-byte writes
  - Unicode and embedded newline payloads
  - Exact and over-limit 16 MiB / 100,000-line append boundaries
  - Concurrent workbench/telemetry writers from distinct sessions
  - Parseable final JSON without LF, malformed/truncated JSON, scalar JSON,
    duplicate IDs, strict/non-ISO timestamps, unknown canonical event types,
    invalid required fields, and legacy structural records

## Recommended Technology

- Primary test layer: unit and focused integration
- Recommended tools: `bun:test`, real filesystem fixtures, and an injected
  narrow synchronous I/O seam
- Notes on why this technology is preferred:
  - It proves byte-offset rollback and real file results without large
    fixtures, hydrate, subprocess-heavy suites, or host mutation.

## Test Construction Strategy

- Test structure:
  - Setup: create an isolated fixture smaller than 100 MiB
  - Exercise: inject deterministic write/sync/truncate failures or run
    concurrent append workers
  - Assert: exact file bytes/length, stable errors, and blocking validation
  - Teardown: remove only the isolated fixture
- Coverage focus:
  - Happy path: all bytes plus LF are written and synced exactly once
  - Main failure path: write/sync failure restores and syncs original length
  - Rollback boundary: rollback failure preserves both causes in
    `AggregateError`
  - Write boundary: repeated short writes complete; zero write fails safely
  - Encoding boundary: Unicode and embedded newline remain one JSON row
  - Concurrency boundary: writers from distinct sessions cannot interleave
  - Read/write boundary: a reader waits for the shared writer lock and never
    sees the partial-write/rollback window
  - Trust boundary: malformed/truncated/duplicate/structurally invalid rows
    block project validation and local-state rebuild without raw content in
    findings; parseable missing-LF and documented legacy rows stay compatible
  - Combined finding boundary: an earlier malformed line plus a final
    schema-valid record without LF reports exact independent error/advisory
    counts; invalid final rows never receive the missing-LF advisory
  - Error boundary: thrown validation errors retain diagnostics only, never
    parsed records or a sensitive payload from an otherwise valid row
  - Capacity boundary: the exact byte/line limits succeed and the next append
    fails under lock without changing existing bytes

## Expected Result

- Functional result: accepted appends are whole durable records and corrupt
  ledgers are never silently skipped or auto-repaired
- Non-functional expectation: bounded synchronous work and diagnostics, no
  network, hydrate, benchmark, full suite, release, or deployment
- Failure messaging expectation: stable code plus line number and explicit
  repair requirement, with no event payload

## Evidence Plan

- Evidence format in report:
  - Command output snippets: no
  - Screenshots or recordings: no
  - Logs or metrics: AFOL evidence IDs only
- Pass/fail rule:
  - Each intended failure must execute RED before production edits; the same
    tests plus focused pre-existing consumers must pass GREEN.
- Finding contract:
  - At most five findings are displayed; totals and omitted counts remain
    exact, and no raw record field appears.
- Report link target:
  - Governed F-29 workbench report created by AFOL lifecycle

## Risks and Follow-ups

- Open risk: power loss beyond successful `fsync` filesystem/device semantics
  -> Follow-up: document limitation; do not claim stronger durability
- Deferred case: explicit repair of the incident ledger -> Owner: parent
  integration lane after this validator is independently reviewed

## Acceptance

- [x] Journey is explicit
- [x] Click and command path is explicit
- [x] Recommended technology is justified
- [x] Construction strategy is explicit
- [x] Expected result is explicit
- [x] Evidence plan is explicit
