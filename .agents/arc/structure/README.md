# Structure

This folder contains project structure maps and directory conventions.

## Purpose

Structure files document **how the project is organized** at a directory level.

## Auto-Generated vs Manual

This project supports **both** approaches:

### Auto-Generated (Recommended for large projects)
- Run: `python .agents/scripts/agents-structure-map.py .`
- Generates: File inventory with descriptions
- Updates: Incremental via cache
- Best for: 200+ files, frequent changes

### Manual (Recommended for conventions)
- Edit: `default.md` or custom `.md` files
- Documents: Rules, conventions, import patterns
- Updates: When conventions change
- Best for: Defining standards

## Structure

```
structure/
├── README.md              # This file
├── TEMPLATE_structure.md  # Template for manual docs
├── default.md             # Default project structure
├── <project-type>.md      # Project-type specific structures
└── *.md                   # Auto-generated sections (frontend.md, backend.md, etc.)
```

## When to use

Create a structure file when:
- Starting a new project type
- Documenting monorepo layout
- Mapping microservices architecture
- Defining folder conventions

## Structure map format

Structure files use a tree format with annotations:

```markdown
## Directory Tree

```
project-root/
├── src/                    # Source code
│   ├── components/         # Reusable components
│   │   └── README.md       # Component conventions
│   ├── lib/                # Library code
│   └── main.ts             # Entry point
├── tests/                  # Test files
│   ├── unit/               # Unit tests
│   └── e2e/                # E2E tests
└── docs/                   # Documentation
    └── api/                # API docs
```

## Directory Rules

| Directory | Purpose | Allowed files |
|-----------|---------|---------------|
| `src/` | Source code | `.ts`, `.tsx`, `.js` |
| `tests/` | Tests | `.test.ts`, `.spec.ts` |
| `docs/` | Documentation | `.md` |
```

## Linking to architecture

Structure files complement architecture docs:

- `structure/` → **Physical layout** (directories, files)
- `arc/ARCHITECTURE.md` → **Logical layout** (components, layers)
- `arc/SPECS/` → **Behavior** (what system does)

## Updating structure

When project structure changes:

1. Update relevant structure file
2. Add changelog entry
3. Link from plan/report if structure change is part of work

---
*Structure folder: `.agents/arc/structure/`*
