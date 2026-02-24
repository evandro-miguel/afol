---
id: TOOL-007
theme: agents-structure-map
type: tool-doc
status: active
owner: system
created_at: 2026-02-20T00:00:00-03:00
updated_at: 2026-02-23T00:00:00-03:00
links:
  tools_json: ./tools-json.md
  index: ./agents-index.md
---

# agents-structure-map.py - Structure Mapping

## Why It Exists

**Problem:** Projects grow and structure becomes complex. New developers (or agents) need to:
- Understand file organization
- Know where each type of code lives
- Have code overview

**Solution:** Automatic generation of structure documentation with file inventory.

## Function

Scans project and generates documentation:

1. **File inventory** - By category
2. **Line counts** - Size of each file
3. **Descriptions** - Extracted from comments/docstrings
4. **Grouping** - Frontend, Backend, Types, Tests, etc.
5. **Cache** - For incremental updates

## What It Touches

### Files Read

| File | Purpose |
|------|---------|
| Target project (e.g., `.`) | Files to map |
| `.agents/agents.config` | Path configuration |

### Files Written

| File | Purpose |
|------|---------|
| `.agents/arc/structure/README.md` | Overview |
| `.agents/arc/structure/frontend.md` | Frontend |
| `.agents/arc/structure/backend.md` | Backend |
| `.agents/arc/structure/tests.md` | Tests |
| ... | Other categories |

## How to Configure

### Default Sections

```python
DEFAULT_SECTIONS = {
    "frontend": {
        "patterns": ["components", "hooks", "ui"],
        "extensions": [".tsx", ".jsx", ".vue"],
        "title": "Frontend",
        "description": "React components, hooks, and UI elements"
    },
    "backend": {
        "patterns": ["services", "api", "utils"],
        "extensions": [".ts", ".py", ".go"],
        "title": "Backend"
    },
    "tests": {
        "patterns": ["test", "spec", "__tests__"],
        "extensions": [".test.ts", ".spec.py"],
        "title": "Tests"
    }
}
```

## How to Modify

### Add New Category

1. Add to `DEFAULT_SECTIONS` dict
2. Define patterns and extensions
3. Create template in `.agents/arc/structure/`

## How to Test

```bash
# Generate structure docs
./.agents/agents structure-map . --output .agents/arc/structure/

# Via Makefile
make structure

# Verify output
cat .agents/arc/structure/README.md
```

## Output Example

```markdown
# Project Structure

## Frontend
| File | Lines | Description |
|------|-------|-------------|
| src/components/Button.tsx | 150 | Reusable button component |
| src/hooks/useAuth.ts | 80 | Authentication hook |

## Backend
| File | Lines | Description |
|------|-------|-------------|
| src/api/users.py | 200 | User API endpoints |
```

## Related

- [agents-index.md](./agents-index.md) - Index generation
- [tools-json.md](./tools-json.md) - Tool catalog

---
*Document: `.agents/a-docs/agentic/agents-structure-map.md`*
