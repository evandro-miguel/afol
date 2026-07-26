---
doc_type: "workbench_plan"
id: "260726_1730_event-ledger-durability_plan_01"
session_id: "260726_1730_event-ledger-durability"
theme: "event-ledger-durability"
status: "active"
created_at: "2026-07-26T20:30:43.676Z"
updated_at: "2026-07-26T20:30:43.676Z"
roadmap_feature: "F-29"
feature_id: "F-29"
parent_spec: "260715_afol-1-0-linux-wsl-finalization_spec_01"
task_ids: "T-01"
governance_status: "governed"
spec_required: true
pending_spec: false
pending_spec_status: "none"
pending_spec_missing: ""
pending_spec_resolution_hint: "linked to roadmap feature and parent spec"
spec_waiver_reason: ""
---

# Plan: event-ledger-durability

This ExecPlan is the living execution contract for the F-29 event-ledger
durability remediation. It remains active until independent spec and quality
reviews accept the focused implementation.

## Purpose / Big Picture

AFOL workbench and telemetry events share one JSONL ledger. The former writer
was protected only by a session lock, the latter had no lock, and both used a
single append call without rollback. A quota failure could therefore leave a
partial record that local-state consumers silently skipped. The completed
implementation must make accepted appends whole and synced, and it must stop
validation/rebuild before corrupt input can produce trustworthy-looking
derived state.

## Progress

- [x] 2026-07-26 20:28Z - Reopened F-29 and created the child/spec-test
      governance contract.
- [x] 2026-07-26 20:33Z - Ran the original implementation RED: partial-tail
      append, absent validation, and rebuild-over-corruption all failed.
- [x] 2026-07-26 20:43Z - Added the shared durable writer, locked strict reader,
      bounded validator, and fail-closed consumers.
- [x] 2026-07-26 20:55Z - Passed 22 focused adversarial tests, 103 focused
      consumer regressions, four lifecycle regressions, typecheck, Biome, and
      diff check.
- [x] 2026-07-26 21:24Z - Reproduced five RED assertions for four P1 review
      findings, then passed 26 adversarial tests after strict ISO/type
      validation, error sanitization, and locked capacity preflight.
- [x] 2026-07-26 21:32Z - Reproduced and corrected the P2 combined-finding
      boundary so a valid final no-LF record retains its advisory despite an
      independent malformed earlier line.
- [ ] Independent spec and quality reviews accept the implementation.
- [ ] The orchestrator records final evidence or returns concrete remediation.

## Surprises & Discoveries

- Observation: the global ledger had two writer contracts but no global
  serialization boundary.
  Evidence: `appendWorkbenchEvent` locked only `event.session`, while
  `appendTelemetryEvent` directly appended.
- Observation: malformed lifecycle rows were silently skipped and rebuild
  could overwrite a prior snapshot.
  Evidence: the initial three-test RED was `0 pass / 3 fail`.
- Observation: parseable legacy records without final LF exist as a
  compatibility shape.
  Evidence: governance review required advisory validation while the writer
  still refuses to auto-insert or truncate existing bytes.
- Observation: `validate-internals.test.ts` enters benchmark-like paths and had
  unrelated baseline failures in this checkout.
  Evidence: the run was stopped immediately after unrelated registry/runtime
  failures; it is not claimed as validation evidence.
- Observation: structural typing allowed an internal inspection object to be
  passed to the public validation error with its parsed records still attached.
  Evidence: serializing `error.validation` exposed a valid sensitive record
  that preceded a malformed row before the remediation.

## Decision Log

- Decision: use one synchronous `appendEventLedgerRecord` primitive under
  `withResourceLocks(root, [canonicalEventPath])`.
  Rationale: it preserves the existing synchronous lifecycle API and provides
  one cross-session/cross-process lock without WAL/SQLite expansion.
  Date/Author: 2026-07-26 / implementer
- Decision: rollback the same verified descriptor to its captured byte offset
  and sync it; aggregate primary and rollback failures.
  Rationale: pathname reopen could truncate a replacement and lose evidence.
  Date/Author: 2026-07-26 / implementer
- Decision: legacy structural rows and a parseable missing final LF are
  advisories; malformed, truncated, duplicate, non-object, limit, unreadable,
  and invalid canonical schemas block consumers.
  Rationale: preserve accepted historical shapes without allowing corrupt
  input to drive state.
  Date/Author: 2026-07-26 / governance review
- Decision: capacity is checked against the prospective byte and physical-line
  totals while holding the canonical ledger lock.
  Rationale: a successful append must never create a ledger that its bounded
  readers immediately reject.
  Date/Author: 2026-07-26 / P1 remediation

## Outcomes & Retrospective

- Outcome: implementation and focused verification are complete in the
  isolated worktree; no incident-ledger repair, hydrate, network, full suite,
  benchmark, deploy, push, or `main` mutation occurred.
- Remaining: independent reviewers must inspect spec conformance and code
  quality. T-01 intentionally remains `in_progress`.
- Lesson: a JSONL ledger shared across sessions is a single resource even when
  its records originate inside per-session lifecycle locks.

## Governance Context

- Roadmap feature: `F-29`
- Parent spec: `260715_afol-1-0-linux-wsl-finalization_spec_01`
- Child spec: `260726_event-ledger-durability_spec-child_01`
- Spec-test:
  `260726_event-ledger-durability_spec-test_01`

## Context and Orientation

- `cli/services/events/ledger.ts` owns canonical path resolution, durable
  append, bounded validation, and lock-respecting reads.
- `cli/services/local-state/workbench-events.ts` and
  `cli/services/events/telemetry.ts` are the two writers.
- `cli/services/local-state/workbench-index.ts`,
  `cli/services/workbench/lifecycle.ts`, and
  `cli/services/evolution/observation-ingest.ts` are the affected consumers.
- `cli/services/project/validate.ts` and
  `cli/services/health/checker.ts` expose blocking operator findings.

## Scope

- In scope: global file locking, full-byte append, sync, offset rollback,
  content-free bounded validation, reader locking, and focused regressions.
- Out of scope: incident repair, automatic truncation, WAL/SQLite, hydrate,
  full suite, release/benchmark execution, network, deploy, and push.

## Plan of Work

The writer captures and validates one canonical descriptor, rejects an
existing non-LF tail, loops over byte writes, validates final size, syncs the
file and new parent entry, and rolls back to the prior offset on failure.
Readers acquire the same resource lock, parse a bounded snapshot, and return
only supported records or a stable validation error. Each state-producing
consumer validates before mutation.

## Concrete Steps

1. Run `bun test cli/tests/event-ledger-durability.test.ts` and preserve the
   initial RED result.
2. Implement the shared writer/validator and route both writers plus all
   affected readers through it.
3. Run the new focused tests and the affected telemetry, local-state,
   validation, evolution, and lifecycle regressions.
4. Run typecheck, narrow Biome, `git diff --check`, then request independent
   spec and quality reviews without committing.

## Interfaces and Dependencies

- Runtime: Bun/TypeScript and synchronous `node:fs`.
- Lock: `withResourceLocks` from `cli/services/io/session-lock.ts`.
- Safety: `resolveProjectWritePath` and `assertSafeSourceFile`.
- New interface: `appendEventLedgerRecord`,
  `validateEventLedger`, `readEventLedgerRecords`, and stable
  `EVENT_LEDGER_*` issue codes.

## Risks and Mitigations

- Interleaved cross-session writes -> one canonical resource lock.
- Partial or falsely reported writes -> byte loop plus exact final size.
- Destructive rollback against a swapped pathname -> same descriptor and
  repeated path identity checks.
- Payload disclosure -> issue codes, line numbers, counts, and no raw content.
- Legacy breakage -> structural legacy rows and parseable no-LF tail remain
  advisory; canonical telemetry v1 remains strict.

## Validation and Acceptance

- Unit: `bun test cli/tests/event-ledger-durability.test.ts` (`27/0`).
- Focused consumers: telemetry, local-state, validate command, and evolution
  observation ingest (`103/0`).
- Lifecycle focus: four affected tests (`4/0`).
- Typecheck: `bun run typecheck` using the existing source-checkout
  dependencies (`passed`).
- Lint: narrow Biome over 12 changed TypeScript files (`passed`).
- Diff: `git diff --check` (`passed`).
- E2E/full/release/benchmark: intentionally not run in this degraded-system
  remediation lane.

## Idempotence and Recovery

Focused tests create and remove only small isolated temporary roots. Failed
appends restore the captured offset when possible. Existing corrupt ledger
bytes are never changed automatically; explicit evidence-led repair remains a
separate orchestrator action.

## Completion Gate

- [x] Task exists and tracks executable work.
- [x] Child and spec-test govern the implementation.
- [x] RED and focused GREEN are recorded in this plan.
- [x] No optional sidecars were created.
- [x] The plan is self-contained for reviewer handoff.
- [ ] Independent reviews pass and evidence is recorded.
