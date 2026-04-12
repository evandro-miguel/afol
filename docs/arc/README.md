---
doc_type: architecture
id: 260223_0000_arc_architecture_01
status: active
created_at: '2026-02-23T00:00:00Z'
updated_at: '2026-03-23T18:06:20-03:00'
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
├── map/                 # Current-state descriptive maps and analysis surfaces
├── structure/           # Project structure maps
│   ├── README.md
│   ├── TEMPLATE_structure.md
│   └── default.md
├── SPECS/               # Technical specifications
│   ├── README.md
│   ├── INDEX.md
│   ├── TEMPLATE_spec.md
│   ├── TEMPLATE_spec-child.md
│   ├── TEMPLATE_spec-test.md
│   └── TEMPLATE_spec-lite.md
├── DECISIONS/           # Architecture Decision Records (ADRs)
│   └── TEMPLATE_adr.md
└── README.md            # This file
```

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

- Physical directory layout
- Folder conventions
- Entry points
- Import conventions

### map/

- Current-state descriptive repository maps
- Analysis evidence and codemap-style surfaces
- Refreshable operator references
- Never the approval source for roadmap/spec intent

### Specifications (SPECS/)

- Full SPEC: new features, architectural changes
- SPEC CHILD: child/local feature refinement
- SPEC TEST: journey-first testing strategy before test implementation
- SPEC LITE: legacy compatibility alias during migration to SPEC CHILD

### Architecture Decision Records (DECISIONS/)

- Context and problem statement
- Decision and rationale
- Consequences (positive/negative)
- Status (proposed/accepted/deprecated)

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

---

*Architecture folder: `docs/arc/`*
