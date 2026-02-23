---
doc_type: structure
id: "STRUCT_default"
name: "default"
status: active
created_at: "2026-02-23T00:00:00Z"
updated_at: "2026-02-23T00:00:00Z"
---

# Structure: Default Project

## Overview

- **Type:** Generic / Default
- **Stack:** Agnostic
- **Monorepo:** No
- **Last verified:** 2026-02-23

## Directory Tree

```
project-root/
├── .agents/                  # Agentic system
│   ├── a-docs/               # Documentation
│   │   ├── templates/        # Doc templates
│   │   ├── standards/        # Standards
│   │   ├── lessons/          # Lessons learned
│   │   ├── specs/            # Specifications
│   │   └── arc/              # Architecture docs
│   ├── arc/                  # Architecture (source of truth)
│   │   ├── SPECS/            # Technical specs
│   │   ├── DECISIONS/        # ADRs
│   │   └── structure/        # Structure maps
│   ├── wb/                   # Workbench (sessions)
│   ├── rules/                # Agent rules
│   ├── scripts/              # Operational scripts
│   ├── skills/               # Agent skills
│   └── z-arq/                # Archive (deleted files)
├── src/                      # Source code
│   ├── components/           # Components
│   ├── lib/                  # Library code
│   └── main.EXT              # Entry point
├── tests/                    # Test files
│   ├── unit/                 # Unit tests
│   └── e2e/                  # E2E tests
├── docs/                     # Documentation
│   └── api/                  # API docs
└── config/                   # Configuration files
```

## Directory Rules

| Directory | Purpose | Allowed files | Conventions |
|-----------|---------|---------------|-------------|
| `.agents/` | Agentic system | `.md`, `.py` | All docs in templates |
| `src/` | Source code | Language files | Colocate tests |
| `tests/` | Tests | `.test.*`, `.spec.*` | Mirror src structure |
| `docs/` | Documentation | `.md` | One topic per file |

## Entry Points

| File | Purpose | Command |
|------|---------|---------|
| `src/main.*` | Application entry | `run` |
| `src/index.*` | Library entry | `import` |

## Configuration Files

| File | Purpose | Scope |
|------|---------|-------|
| `.agents/AGENTS.md` | Agent contract | Project-wide |
| `AGENTS.md` | Root agent contract | Project-wide |

## Colocation Rules

Files that should be colocated:

- `<file>.ext` + `<file>.test.ext`
- `README.md` + source folder
- Component + styles + tests

## Import Conventions

```
# Internal imports
import { X } from './module'

# Relative imports
import { Y } from '../sibling'
```

## References

- Architecture: `.agents/arc/ARCHITECTURE.md`
- Templates: `.agents/a-docs/templates/`
- Workbench: `.agents/wb/`

---
*Structure: `.agents/arc/structure/default.md`*
