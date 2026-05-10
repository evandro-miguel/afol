---
doc_type: index
id: folder-guide
theme: arc
status: active
created_at: '2026-05-10T16:24:38+00:00'
updated_at: '2026-05-10T16:24:38+00:00'
---

# Architecture

This folder contains all architecture documentation for the project.

## Purpose

Architecture documents define **how** the system is structured and how components interact.

## Structure

```text
arc/
├── overview.md          # System overview and context
├── decisions/           # Architecture Decision Records (ADRs)
│   ├── ADR-001.md
│   └── ADR-002.md
├── components/          # Component documentation
│   ├── <component>.md
│   └── <component>.md
├── diagrams/            # Architecture diagrams (or links)
│   └── <diagram>.md
└── README.md            # This file
```

## Document types

### Overview

- System context diagram
- High-level architecture
- Technology stack
- Deployment model

### Architecture Decision Records (ADRs)

- Context and problem statement
- Decision and rationale
- Consequences (positive/negative)
- Status (proposed/accepted/deprecated)

### Component documentation

- Responsibility
- Interfaces
- Dependencies
- Data model

### Diagrams

- C4 model diagrams (Context, Container, Component, Code)
- Sequence diagrams
- Data flow diagrams

## ADR Template

```markdown
---
doc_type: adr
id: "ADR-<number>"
title: "<adr title>"
status: proposed | accepted | deprecated | superseded
created_at: "YYYY-MM-DDTHH:MM:SSZ"
updated_at: "YYYY-MM-DDTHH:MM:SSZ"
supersedes: ["ADR-<number>"]  # if applicable
---

## ADR <number>: <title>

### Status

<status>

### Context

- <problem statement>
- <constraints>
- <assumptions>

### Decision

- <the decision made>
- <rationale>

### Consequences

#### Positive

- <benefit>

#### Negative

- <trade-off>

#### Neutral

- <implication>

### Compliance

- [ ] Architecture follows this decision
- [ ] Code reviewed for compliance

### References

- <related docs>
```

## Linking to work

Plans should reference architecture docs:

```markdown
## Approach

- Follow ADR-003: Event-driven architecture
- Component: auth-service (see arc/components/auth.md)
```

## Keeping current

- Update ADRs when making significant changes
- Deprecate (don't delete) old ADRs
- Link ADRs to implementation tasks

---

*Architecture folder: `docs/arc/`*
