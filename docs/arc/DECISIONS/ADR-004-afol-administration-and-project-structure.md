---
doc_type: adr
id: ADR-004
title: AFOL Administration and Project Structure Surfaces
status: accepted
created_at: '2026-06-12T13:37:19-03:00'
updated_at: '2026-06-12T13:37:19-03:00'
decision_type: architecture
supersedes: ADR-003
superseded_by: ""
affected_specs:
- docs/arc/SPECS/260612_afol-administration-project-structure-onion-architecture_spec_01.md
- docs/arc/SPECS/260612_agent-operational-state-context-library_spec_01.md
affected_rules: []
affected_skills: []
affected_commands:
- afol hydrate
- afol db rebuild
- afol validate drift
- afol ctx bundle
archive_reason: ""
---

# ADR-004: AFOL Administration and Project Structure Surfaces

## Context

AFOL has one public front door, `afol`, and mutable project-local runtime state
has moved under `.afol/**`. The remaining strategic administration surface still
lives under `docs/arc/**`.

The next architecture direction is to make AFOL feel like a layered local
execution OS. That requires a clear split between desired-state administration,
present-state project structure, session execution, evidence, memory, library,
materialized state, events, and providers.

ADR-003 made JSON/JSONL the proposed operational source of truth. This decision
supersedes that narrower direction: Markdown/YAML should remain the canonical
reviewable administration and interaction surface, while SQLite becomes the
materialized execution/query layer.

## Decision

Adopt these target surfaces:

- `.afol/adm/**` for project administration: manifesto, architecture, roadmap,
  specs, ADRs, changelog, archive, and policy.
- `.afol/pstr/**` for present-state project structure: maps, inventories,
  generated structure evidence, and snapshots.
- `.afol/state/afol.db` for SQLite materialized execution state.
- `.afol/wb/**` for governed session execution.
- `.afol/data/events/**` for append-only audit events.

`docs/arc/**` remains the current canonical administration surface until AFOL
ships command-managed migration, hydration, drift validation, and index support
for `.afol/adm/**`.

SQLite is derived and rebuildable. It must carry source hashes and must not
overwrite human-authored Markdown/YAML outside AFOL-managed blocks.

IWE is a library provider only. It may operate through AFOL-governed library
commands, but it never owns core direction, workbench state, evidence, memory,
or SQLite state.

## Consequences

Positive:

- Desired-state direction and present-state structure have explicit AFOL-owned
  homes.
- The project can add SQLite without making the database an opaque authority.
- Memory and library stay separate.
- Providers remain outer-layer integrations.
- `docs/arc/**` migration can happen safely instead of through a blind file
  move.

Negative:

- The project carries a transitional period where `docs/arc/**` remains active
  while `.afol/adm/**` is specified as the target.
- Existing specs that mention JSON as an operational source need reinterpretation
  or updates under this ADR.
- Migration and drift tooling become required before the directory move is safe.

## Verification

- The roadmap points F-18 to the onion/source-boundary parent spec.
- Architecture and manifesto name `.afol/adm`, `.afol/pstr`, and
  `.afol/state/afol.db`.
- Specs describe `docs/arc/**` as transitional until migration support exists.
- Future implementation must add migration, hydration, drift, and SQLite tests.

## Status

accepted
