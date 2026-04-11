---
id: TOOL-005
theme: agents-index
type: tool-doc
status: active
owner: system
created_at: 2026-02-20T00:00:00-03:00
updated_at: 2026-02-23T00:00:00-03:00
links:
  tools_json: ./tools-json.md
  structure_map: ./agents-structure-map.md
---

# agents-index.py - Index Update

## Why It Exists

**Problem:** Specs and ADRs are created in separate directories. Without a centralized index, it's difficult to:

- Discover existing documents
- See status of each document
- Navigate between related documents

**Solution:** Automatic indexes that aggregate metadata from all documents.

## Function

Scans directories and generates indexes:

1. **SPECS/INDEX.md** - Lists all specifications
2. **DECISIONS/INDEX.md** - Lists all architecture decisions

Extracts from frontmatter:

- ID, theme, status
- Owner, created_at, updated_at
- Related links

## What It Touches

### Files Read

| Directory | Purpose |
|-----------|---------|
| `docs/arc/SPECS/**/*.md` | Specs to index |
| `docs/arc/DECISIONS/**/*.md` | ADRs to index |

### Files Written

| File | Purpose |
|------|---------|
| `docs/arc/SPECS/INDEX.md` | Specs index |
| `docs/arc/DECISIONS/INDEX.md` | ADRs index |

## How to Configure

### agents.config

```yaml
paths:
  specs_dir: docs/arc/SPECS
  decisions_dir: docs/arc/DECISIONS
```

## How to Modify

### Change Index Format

Edit function `generate_index_md()`:

```python
def generate_index_md(entries: List[DocEntry], output_path: Path):
    # Current format:
    # | ID | Theme | Status | Owner | Created | Links |
    # Modify as needed
```

## How to Test

```bash
# Run index
./.agents/agents index

# Verify generated files
cat docs/arc/SPECS/INDEX.md
cat docs/arc/DECISIONS/INDEX.md
```

## Output Example

```markdown
# Specs Index

| ID | Theme | Status | Owner | Created | Links |
|----|-------|--------|-------|---------|-------|
| SPEC-AUTH-001 | OAuth2 Implementation | active | team | 2026-02-20 | [ADR-003] |
```

## Related

- [agents-structure-map.md](./agents-structure-map.md) - Structure mapping
- [tools-json.md](./tools-json.md) - Tool catalog

---

*Document: `docs/agentic/agents-index.md`*
