---
doc_type: architecture
id: "260223_0000_arc_architecture_01"
status: active
created_at: "2026-02-23T00:00:00Z"
updated_at: "2026-02-23T00:00:00Z"
---

# Architecture

This folder contains all architecture documentation for the project.

## Purpose

Architecture documents define **how** the system is structured and how components interact.

## Structure

```
arc/
├── ARCHITECTURE.md      # Root architecture document
├── GENERAL-ROADMAP.md   # North star and milestones
├── structure/           # Project structure maps
│   ├── README.md
│   ├── TEMPLATE_structure.md
│   └── default.md
├── SPECS/               # Technical specifications
│   ├── README.md
│   ├── INDEX.md
│   ├── TEMPLATE_spec.md
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

### Specifications (SPECS/)
- Full SPEC: new features, architectural changes
- SPEC LITE: small changes, localized fixes

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

---
*Architecture folder: `.agents/arc/`*
