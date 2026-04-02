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
├── docs/                     # Project-owned documentation
│   ├── arc/                  # Goal-state canon (roadmap, specs, ADRs)
│   │   ├── SPECS/            # Technical specs
│   │   ├── DECISIONS/        # ADRs
│   │   └── structure/        # Structure maps
│   ├── map/                  # Current-state repository mapping
│   ├── standards/            # Standards
│   ├── templates/            # Doc templates
│   ├── telemetry/            # Telemetry docs and reports
│   ├── patterns/             # Pattern catalog
│   ├── knowledge/            # Indexed findings
│   └── lessons/              # Lessons learned
├── .agents/                  # Agent system surfaces
│   ├── wb/                   # Workbench (sessions)
│   ├── rules/                # Agent rules
│   ├── scripts/              # Operational scripts
│   ├── skills/               # Agent skills
│   ├── data/                 # Operational data
│   └── z-arq/                # Archive (deleted files)
├── src/                      # Source code
│   ├── components/           # Components
│   ├── lib/                  # Library code
│   └── main.EXT              # Entry point
├── tests/                    # Test files
│   ├── unit/                 # Unit tests
│   └── e2e/                  # E2E tests
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

- Architecture: `docs/arc/ARCHITECTURE.md`
- Templates: `docs/templates/`
- Workbench: `.agents/wb/`

---
*Structure: `docs/arc/structure/default.md`*
