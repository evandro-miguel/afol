---
id: TOOL-006
theme: agents-lint-docs
type: tool-doc
status: active
owner: system
created_at: 2026-02-20 00:00:00-03:00
updated_at: '2026-04-13T19:36:48-03:00'
links:
  tools_json: ./tools-json.md
  doctor: ./agents-doctor.md
---

# agents-lint-docs.py - Markdown Documents Validation

## Why It Exists

**Problem:** Markdown documents can have inconsistencies:

- Checkboxes in different formats
- Invalid status in frontmatter
- Task IDs outside convention
- Broken cross-references

**Solution:** Linter specific for `.agents` documents that validates conventions.

## Function

Validates markdown documents:

1. **Checkbox markers** - `- [X]`, `- [/]`, `- [ ]`
2. **Status fields** - draft, active, review, approved, etc.
3. **State values** - pending, in_progress, done, etc.
4. **Frontmatter** - Required fields
5. **Cross-references** - Links between documents
6. **Task IDs** - Convention T-NN

## What It Touches

### Files Read

| File | Purpose |
|------|---------|
| `.afol/wb/**/*.md` | Workstreams |
| `docs/arc/**/*.md` | Architecture |
| `.agents/agents.config` | Lint exclusions |

### Files Written

| File | Purpose |
|------|---------|
| None (normal mode) | Validation only |
| Same files (--fix mode) | Fixes issues |

## How to Configure

### agents.config

```yaml
lint:
  excluded_path_prefixes:
    - docs/map/extra/
    - docs/map/structure/
    - scripts/.agent/docs/
    - z-arq/
```

### Valid Statuses

```python
VALID_STATUSES = [
    "draft", "active", "review", "approved", "final",
    "deprecated", "superseded", "done", "blocked"
]
```

## How to Modify

### Add New Validation

```python
def validate_new_thing(filepath: Path) -> List[str]:
    """Return list of errors found."""
    errors = []
    # Add validation logic
    return errors
```

## How to Test

No public `afol lint-docs` verb exists yet. The command below is factory-only compatibility.

```bash
# Run lint
./.agents/agents lint-docs .afol/wb/

# Fix issues
./.agents/agents lint-docs .afol/wb/ --fix

# Legacy just targets are retired migration debt.
# Keep lint-docs wrapper usage factory-only until a public AFOL verb lands.
```

## Output

### Success

```text
✓ All documents valid
```

### Errors Found

```text
file.md:15 - Invalid checkbox format: use '- [x]' not '- [X]'
file.md:23 - Invalid status: 'inprogress' not in valid statuses
file.md:45 - Missing frontmatter field: 'updated_at'
```

## Related

- [agents-doctor.md](./agents-doctor.md) - Structure validation
- [tools-json.md](./tools-json.md) - Tool catalog

---

*Document: `docs/agentic/agents-lint-docs.md`*
