---
doc_type: architecture
id: 260223_0000_arc_architecture_01
status: active
created_at: '2026-02-23T00:00:00Z'
updated_at: '2026-04-13T13:36:55-03:00'
---

# Architecture

This folder contains all architecture documentation for the project.

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

Current-state map evidence lives outside `docs/arc/` under `docs/map/`,
including the structure files in `docs/map/structure/`.
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

### structure/

- Physical directory layout under `docs/map/structure/`
- Folder conventions for the current-state structure view
- Entry points and import conventions for the map surface

### map/

- Current-state descriptive repository maps
- Analysis evidence and codemap-style surfaces
- Refreshable operator references
- Never the approval source for roadmap/spec intent
- Includes the canonical structure index in `docs/map/structure/`

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

- Follow ADR-003: Event-driven architecture
- Implement SPEC-AUTH-001: OAuth2 authentication
```

## Keeping current

- Update ADRs when making significant changes
- Deprecate (don't delete) old ADRs
- Link ADRs to implementation tasks
- Update SPECS INDEX for every new spec
- Keep `map/` descriptive and refreshable; keep desired-state decisions in roadmap/spec/ADR docs outside that folder
- Keep the structure view in `docs/map/structure/`; do not recreate `docs/arc/structure/` as a second current-state surface

---

*Architecture folder: `docs/arc/`*
