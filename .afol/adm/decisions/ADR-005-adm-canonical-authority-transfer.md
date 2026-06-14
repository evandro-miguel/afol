---
doc_type: adr
id: ADR-005
title: AFOL Administration Canonical Authority Transfer
status: accepted
created_at: '2026-06-14T00:00:00-03:00'
updated_at: '2026-06-14T00:00:00-03:00'
decision_type: architecture
supersedes: ADR-004
superseded_by: ""
affected_specs:
- .afol/adm/specs/260612_afol-administration-project-structure-onion-architecture_spec_01.md
- .afol/adm/specs/260612_agent-operational-state-context-library_spec_01.md
- .afol/adm/specs/INDEX.md
affected_rules: []
affected_skills: []
affected_commands:
- afol adm migrate
- afol validate project
- afol local-state rebuild
archive_reason: ""
---

# ADR-005: AFOL Administration Canonical Authority Transfer

## Context

F-18 delivered the migration system: `cli/services/adm/**` and the `afol adm`
commands exist, and the administration content has already been copied from
`docs/arc/**` into `.afol/adm/**`.

The remaining question is authority. The repository now needs one canonical
administration surface, not a transitional split.

## Decision

Make `.afol/adm/**` the canonical project-administration surface for manifesto,
roadmap, specs, decisions, and policy.

Keep `docs/arc/**` as a frozen transitional archive only. It remains in the
repository for reversibility, comparison, and history, but it is no longer the
authority surface.

`src/project-template/**` is unaffected by this decision.

## Rationale

- Migration support now exists.
- The administration content has already been copied into `.afol/adm/**`.
- Canonical authority must match the live surface used by the CLI and validators.
- Keeping `docs/arc/**` frozen preserves reversibility without retaining split
  authority.

## Alternatives Considered

1. Keep `docs/arc/**` canonical until a later cleanup.
   - Rejected: migration is already implemented and validated.
2. Delete `docs/arc/**` after migration.
   - Rejected: reversible archive retention is still valuable.
3. Maintain dual canonical surfaces.
   - Rejected: creates ambiguity and future drift.

## Consequences

- Validators, indexers, and specs must read `.afol/adm/**` as the source of
  truth.
- `docs/arc/**` becomes archive-only transitional content.
- Spec links, roadmap links, and ADR references now point at `.afol/adm/**`.
- The downstream template remains unchanged.

## Status

accepted
