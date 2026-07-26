---
doc_type: spec-child
id: 260726_event-ledger-durability_spec-child_01
theme: event-ledger-durability
status: final
owners:
- orchestrator
workstream_intent: remediation
artifact_purpose: Make the shared AFOL event ledger durable, concurrency-safe, and fail-closed.
created_at: '2026-07-26T20:28:59Z'
updated_at: '2026-07-26T20:28:59Z'
roadmap_feature: F-29
spec_role: child
parent_spec: 260715_afol-1-0-linux-wsl-finalization_spec_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  parent: .afol/adm/specs/260715_afol-1-0-linux-wsl-finalization_spec_01.md
  spec_test: .afol/adm/specs/F-29/spec-tests/260726_event-ledger-durability_spec-test_01.md
  plan: .afol/wb/260726_1730_event-ledger-durability/260726_1730_event-ledger-durability_plan_01.md
  task: .afol/wb/260726_1730_event-ledger-durability/260726_1730_event-ledger-durability_task_01.md
  report: .afol/wb/260726_1730_event-ledger-durability/260726_1730_event-ledger-durability_report_01.md
risk_level: high
---

# SPEC CHILD: Event Ledger Durability

## Intent

- Outcome: every accepted workbench or telemetry event is one durable JSONL
  record, and any untrusted ledger blocks validation and index rebuild before
  derived state can hide corruption.
- Roadmap feature: `F-29`
- Parent spec: `260715_afol-1-0-linux-wsl-finalization_spec_01`

## Child Scope Rationale

Workbench and telemetry events share one global `events.jsonl` file but use
different append paths and do not share a file-scoped lock. A failed append can
leave a partial line, while current readers may skip malformed input. This
child owns the smallest shared writer and validator that restores the ledger
as a trustworthy input without introducing another journal or database.

## User or Operator Journey

1. A workbench lifecycle or telemetry action emits one bounded event object.
2. AFOL serializes it as exactly one UTF-8 JSON object plus LF under the
   canonical event-file resource lock.
3. The writer returns success only after all bytes and the file are synced; a
   failed append is rolled back to the original byte offset and synced.
4. Project validation and local-state rebuild reject partial, malformed,
   duplicate, or structurally invalid ledgers with bounded, content-free
   findings.
5. The operator repairs corruption explicitly from authoritative evidence;
   AFOL never truncates an existing corrupt tail automatically.

## Required Behavior

- Both workbench and telemetry writers use one shared durable JSONL append
  primitive and the same canonical event-file resource lock.
- All event-ledger readers use that same resource lock for one validated
  snapshot, so they cannot observe a cooperative writer between a short write
  and its successful sync or rollback.
- The primitive opens only a safe regular-file destination, records the
  original byte length, rejects a nonempty tail that does not end in LF, loops
  until every serialized byte is written, and calls `fsync`.
- Before writing, the primitive checks the prospective byte and physical-line
  totals under the same ledger lock. An append that would exceed 16 MiB or
  100,000 lines fails with `EVENT_LEDGER_LIMIT_EXCEEDED` without changing the
  ledger; appends ending exactly at either limit remain valid.
- Short writes are supported; a zero-byte write is a failure.
- On write or sync failure, truncate to the original offset and sync the
  rollback before rethrowing the primary failure.
- If rollback also fails, throw an `AggregateError` that preserves primary and
  rollback causes without embedding event content. Close failures never mask a
  prior primary failure.
- Event serialization is exactly one JSON object plus LF. Embedded newline and
  Unicode values remain valid JSON data rather than additional ledger records.
- Project validation parses every nonempty line as an object, accepts canonical
  records plus structurally valid legacy workbench (`type`, `session`, `id`) or
  telemetry (`event_type`, `session_id`, `id`) records, and rejects duplicate
  event IDs. Optional canonical fields are checked when present.
- A parseable final record without LF is accepted with a bounded advisory for
  compatibility, even when an earlier line has an independent blocking error.
  The advisory is emitted only when the final nonempty physical line parses as
  a schema-valid record. An unparseable unterminated tail is a blocking
  truncation error. Writers still reject any existing non-LF tail rather than
  silently inserting or truncating bytes.
- Canonical workbench records use nonempty `id`, `type`, and `session`;
  canonical telemetry v1 records use nonempty `id`, `event_type`,
  `session_id`, `schema_version: "1"`, `source: "afol-cli"`, and an ISO
  timestamp in exact JavaScript instant form (`YYYY-MM-DDTHH:mm:ss.sssZ`).
  Parseable non-ISO date strings are invalid. Optional typed/enumerated fields
  are validated when present.
- Findings are capped at five displayed entries with an omitted count.
  Blocking codes are `EVENT_LEDGER_UNREADABLE`,
  `EVENT_LEDGER_LIMIT_EXCEEDED`, `EVENT_LEDGER_TRUNCATED_TAIL`,
  `EVENT_LEDGER_MALFORMED_JSON`, `EVENT_LEDGER_NON_OBJECT`,
  `EVENT_LEDGER_SCHEMA_INVALID`, and `EVENT_LEDGER_DUPLICATE_ID`. Compatibility
  advisories are `EVENT_LEDGER_LEGACY_RECORD`,
  `EVENT_LEDGER_UNKNOWN_EVENT_TYPE`, and
  `EVENT_LEDGER_MISSING_FINAL_NEWLINE`; an unknown declared canonical event is
  schema-invalid rather than legacy.
- Findings use stable codes, line numbers, and bounded counts; they never echo
  raw line content, notes, commands, or detail payloads.
  `EventLedgerValidationError.validation` is a sanitized diagnostic projection
  and never retains parsed records, including valid sensitive records that
  preceded a later corrupt line.
- Local-state rebuild and all shared-ledger consumers fail closed on malformed,
  truncated, unsupported, duplicate, or schema-invalid records.
- No writer repairs or truncates corruption found before its own append. Crash
  durability remains limited to filesystem and device guarantees after
  successful `fsync`.

## Boundaries

In scope:

- Shared synchronous JSONL append and validation services
- Workbench and telemetry event writers/readers
- Workbench local-state lifecycle projection
- Blocking project validation and focused regression tests

Out of scope:

- Repairing the incident ledger, deleting any event, WAL/SQLite migration,
  hydrate, full-suite/release/benchmark execution, network access, deployment,
  global installation, or changes to `main`

## Risks and Mitigations

- Two session locks can still interleave one global file -> lock the canonical
  ledger path for both writer types.
- A retry after a partial write can preserve corrupt bytes -> roll back to the
  captured offset and sync before returning failure.
- A validator can leak sensitive event fields -> expose only stable codes and
  line numbers with a strict finding cap.
- Automatic recovery can destroy the only failure evidence -> reject an
  existing partial tail and require explicit operator repair.

## Acceptance

- [x] RED tests prove partial writes, sync failures, short/zero writes, and
      cross-session concurrency are unsafe before production changes.
- [x] Both event writers use the shared file-scoped durable primitive.
- [x] Failed appends restore the original byte length or return an aggregate
      primary-plus-rollback failure without payload disclosure.
- [x] Valid Unicode/newline payloads produce exactly one parseable JSONL row.
- [x] Validation rejects malformed, truncated, duplicate, and structurally
      invalid ledgers with bounded content-free findings while accepting the
      documented legacy shapes.
- [x] Local-state rebuild fails closed before writing derived snapshots.
- [x] Focused tests, typecheck, narrow Biome, and diff checks pass.
