---
doc_type: adr
id: ADR-004
title: AFOL Administration and Project Structure Surfaces
status: accepted
created_at: '2026-06-12T13:37:19-03:00'
updated_at: '2026-06-12T17:47:40-03:00'
decision_type: architecture
supersedes: ADR-003
superseded_by: ""
affected_specs:
- .afol/adm/specs/260612_afol-administration-project-structure-onion-architecture_spec_01.md
- .afol/adm/specs/260612_agent-operational-state-context-library_spec_01.md
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
lived under `docs/arc/**`; it is now frozen transitional archive preserved for
reversibility.

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
- `.afol/pstr/**` for current project-structure maps: area maps, critical
  paths, entrypoints, dependencies, flows, tests, and observed structural gaps.
- `.afol/state/afol.db` for SQLite materialized execution state.
- `.afol/wb/**` for governed session execution.
- `.afol/data/events/**` for append-only audit events.

`docs/arc/**` is frozen transitional archive; `.afol/adm/**` is the canonical
administration surface.

SQLite is derived and rebuildable. It must carry source hashes and must not
overwrite human-authored Markdown/YAML outside AFOL-managed blocks.

IWE is a library provider only. It may operate through AFOL-governed library
commands, but it never owns core direction, workbench state, evidence, memory,
or SQLite state.

PSTR is not an execution or governance surface. Commands that rebuild, validate,
or query pstr maps live in `cli/**`; `.afol/pstr/**` contains map outputs only.
If pstr conflicts with source code, source code wins and the pstr map is stale.

Time and freshness are part of the authority boundary. Stale pstr maps, stale
SQLite materialization, stale memory, and stale library claims must not enter
trusted context bundles without warning, rebuild, or explicit override.

AFOL may adopt brain-layer patterns inside this boundary: shape packs,
source-axis routing, hybrid retrieval, graph refs, think-lite gap analysis,
sweep/doctor maintenance, resolver routing, and trust-boundary operation
contexts. It must not adopt always-on ingestion, company-brain scope, mandatory
OAuth, mandatory Postgres/pgvector, or remote admin mutation as MVP
requirements.

## Consequences

Positive:

- Desired-state direction and present-state structure have explicit AFOL-owned
  homes.
- The project can add SQLite without making the database an opaque authority.
- Long-running projects get explicit freshness, health, cleanup, archive, and
  token-budget rules before stale state becomes invisible drift.
- Memory and library stay separate.
- Providers remain outer-layer integrations.
- `docs/arc/**` migration can happen safely instead of through a blind file
  move.

Negative:

- The project carries an archive import path for `docs/arc/**` while
  `.afol/adm/**` remains the live authority.
- Existing specs that mention JSON as an operational source need reinterpretation
  or updates under this ADR.
- Migration and drift tooling become required before the directory move is safe.

## Verification

- The roadmap points F-18 to the onion/source-boundary parent spec.
- Architecture and manifesto name `.afol/adm`, `.afol/pstr`, and
  `.afol/state/afol.db`.
- Specs describe `docs/arc/**` as frozen archive content and `.afol/adm/**` as
  current administration.
- Future implementation must add migration, hydration, drift, and SQLite tests.

## Status

accepted
