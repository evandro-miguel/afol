---
id: TOOL-003
theme: agents-doctor
type: tool-doc
status: active
owner: system
created_at: 2026-02-20 00:00:00-03:00
updated_at: '2026-04-13T19:36:46-03:00'
links:
  tools_json: ./tools-json.md
  lint_docs: ./agents-lint-docs.md
---

# agents-doctor.py - Structure Validation

## Why It Exists

**Problem:** The `.agents` system requires specific structure of folders, templates, and naming conventions. Errors in structure cause cascading failures in other tools.

**Solution:** Automatic validation that checks structure integrity before problems occur.

## Function

Validates `.agents` directory structure:

1. **Required folders** - Checks existence
2. **Templates** - Checks presence of all templates
3. **YAML Frontmatter** - Validates syntax
4. **IDs** - Checks convention (YYMMDD_HHMM_theme_type_N)
5. **Timestamps** - Validates ISO 8601 format
6. **Cross-links** - Checks links between documents

## What It Touches

### Files Read

| File | Purpose |
|------|---------|
| `.agents/agents.config` | Config (required_folders, required_templates) |
| `docs/templates/*.md` | Templates |
| `.afol/wb/**/*.md` | Workstreams to validate |
| `docs/arc/SPECS/**/*.md` | Specs to validate |
| `docs/arc/DECISIONS/**/*.md` | ADRs to validate |

### Files Written

| File | Purpose |
|------|---------|
| None | Read-only and validation |

## How to Configure

Configuration in `.agents/agents.config`:

```yaml
doctor:
  required_folders:
    - docs/templates
    - docs/standards
    - docs/lessons
    - wb
    - rules
    - scripts
  required_templates:
    - plan.md
    - task.md
    - report.md
    - log.md
```

## How to Use

```bash
# Validate structure
.agents/agents doctor

# Via legacy just command runner
AFOL-native command pending; do not use legacy just command runners.
```

## How to Modify

### Main Functions

```python
def validate_folders() -> List[str]:
    """Check required folders exist."""

def validate_templates() -> List[str]:
    """Check required templates exist."""

def validate_frontmatter(filepath: Path) -> List[str]:
    """Validate YAML frontmatter syntax."""

def validate_ids(filepath: Path) -> List[str]:
    """Check ID convention."""

def validate_timestamps(filepath: Path) -> List[str]:
    """Validate ISO 8601 timestamps."""
```

### Adding New Validations

1. Create function `validate_<thing>()` returning `List[str]` (errors)
2. Add to `main()` validation pipeline
3. Update this document

## How to Test

```bash
# Run validation
AFOL-native command pending; do not use legacy just command runners.

# Expected: Exit code 0 if valid, 1 if errors
```

## Output

### Success

```text
✓ All required folders exist
✓ All required templates present
✓ Frontmatter YAML valid
✓ IDs follow convention
✓ Timestamps in ISO 8601 format
✓ Cross-links valid
```

### Errors

```text
❌ Missing folder: .afol/wb
❌ Missing template: plan.md
❌ Invalid frontmatter in file.md: missing 'id' field
```

## Related

- [agents-lint-docs.md](./agents-lint-docs.md) - Markdown linting
- [tools-json.md](./tools-json.md) - Tool catalog

---

*Document: `docs/agentic/agents-doctor.md`*
