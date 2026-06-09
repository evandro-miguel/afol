---
doc_type: index
id: 260223_0000_decisions_index_01
title: Architecture Decision Records Index
created_at: '2026-02-23T00:00:00-03:00'
updated_at: '2026-06-09T08:00:00-03:00'
---

## Architecture Decision Records (ADRs)

Architecture decision records capture significant architectural choices made for this project.

### Purpose

ADRs document:

- **Context** - Situation and problem
- **Decision** - What was decided
- **Consequences** - Results and trade-offs

### Structure

```text
docs/arc/DECISIONS/
├── INDEX.md           # This file - ADR index
├── ADR-001-bun-typescript-canonical-runtime.md
├── ADR-002-afol-sole-public-entrypoint.md
└── ...
```

### Available ADRs

| ID | Title | Status | Date |
|----|-------|--------|------|
| ADR-001 | Bun/TypeScript as Canonical Runtime | Accepted | 2026-06-09 |
| ADR-002 | AFOL as Sole Public Entrypoint | Accepted | 2026-06-09 |

### Creating an ADR

1. Copy `docs/templates/adr.md`
2. Fill in sections
3. Name: `ADR-NNN-<short-title>.md`
4. Update this INDEX.md

### ADR Template

See `docs/templates/adr.md` for the standard format.

### Related

- `docs/arc/ARCHITECTURE.md` - Root architecture
- `docs/arc/SPECS/` - Technical specifications
- [agents-index.md](../agentic/agents-index.md) - Index generation

---

*Document: `docs/arc/DECISIONS/INDEX.md`*
