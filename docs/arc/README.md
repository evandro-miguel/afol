---
doc_type: architecture
id: 260223_0000_arc_architecture_01
status: active
created_at: '2026-02-23T00:00:00Z'
updated_at: '2026-06-12T13:37:19-03:00'
---

# Architecture

This folder contains the current transitional architecture documentation for
the project. Target project administration moves to `.afol/adm/**` after AFOL
ships command-managed migration, hydration, drift validation, and index checks.

## Purpose

Architecture documents define **how** the system is structured and how components interact.

## Structure

```text
arc/
├── ARCHITECTURE.md      # Root architecture document
├── GENERAL-ROADMAP.md   # North star and milestones
├── SPECS/               # Technical specifications
│   ├── README.md
│   └── INDEX.md
├── DECISIONS/           # Architecture Decision Records (ADRs)
└── README.md            # This file
```

Current-state map evidence should move to `.afol/pstr/**` after migration.
Historical `docs/map/**` references are transitional/legacy and must not become
a second desired-state authority.
Reusable templates live only under `docs/templates/`.

## Document types

### ARCHITECTURE.md

- System overview and context
- High-level architecture
- Technology stack
- Deployment model
- Layering rules

### GENERAL-ROADMAP.md

- North star direction
- Current phase
- Milestones
- Prioritization rules

### .afol/pstr/

- Current-state descriptive repository maps
- Analysis evidence and codemap-style surfaces
- Refreshable operator references
- Never the approval source for roadmap/spec intent
- Includes structure indexes, inventories, maps, and generated snapshots

### docs/map/structure/

- Legacy/transitional physical directory layout evidence.
- Do not recreate this surface when `.afol/pstr/**` becomes available.

### Specifications (SPECS/)

- Full SPEC: new features, architectural changes
- SPEC CHILD: child/local feature refinement
- SPEC TEST: journey-first testing strategy before test implementation
- SPEC LITE: legacy compatibility alias during migration to SPEC CHILD

Template files for these spec types live in `docs/templates/`.

### Architecture Decision Records (DECISIONS/)

- Context and problem statement
- Decision and rationale
- Consequences (positive/negative)
- Status (proposed/accepted/deprecated)

The reusable ADR template lives in `docs/templates/adr.md`.

## Linking to work

Plans and tasks should reference architecture docs:

```markdown
## Approach

- Follow ADR-004: AFOL administration and project structure surfaces
- Implement SPEC-AUTH-001: OAuth2 authentication
```

## Keeping current

- Update ADRs when making significant changes
- Deprecate (don't delete) old ADRs
- Link ADRs to implementation tasks
- Update SPECS INDEX for every new spec
- Keep current-state maps descriptive and refreshable. Target project-structure
  evidence belongs under `.afol/pstr/**` after migration; do not recreate
  `docs/arc/structure/` as a second current-state surface.

---

*Architecture folder: `docs/arc/`*
