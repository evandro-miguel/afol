---
doc_type: standard
id: lint-false-positives
theme: standards
status: active
created_at: '2026-02-24T00:00:00-03:00'
updated_at: '2026-04-13T19:36:59-03:00'
---

# Lint False Positives

Guide for handling intentional lint warnings that should not be "fixed".

## Categories of False Positives

### 1. Documentation Examples

Files that **document** markdown syntax will naturally trigger lint warnings:

- `checkbox-protocol.md` - Shows all checkbox states as examples
- `task.md` template - Contains example state board tables
- Pattern templates - Show example frontmatter

**Action:** These are **intentional** - do not fix.

### 2. Unknown doc_type Values

New document types that haven't been added to the validator:

- `tool-doc` - Agent tool documentation (`docs/agentic/`)
- `lesson_entry` - Lesson entries (`docs/lessons/entries/`)
- `pattern` / `pattern_index` - Pattern documentation
- `telemetry_*` - Telemetry docs

**Action:** Update validator or add to allowed list (see below).

### 3. Reference/Rules Files

Files in `.agents/rules/` and `docs/standards/` that show examples:

```markdown
- [x] Valid checkbox
- [X] Invalid example (intentional)
```

**Action:** These demonstrate both valid and invalid syntax - do not fix.

## Updating the Validator

To add new allowed doc_types:

### Option 1: Manual Update

Find the validator script and add to the allowed list:

```python
# .agents/scripts/agents-lint-docs.py
VALID_DOC_TYPES = [
    'plan', 'task', 'report', 'log', 'research', 'brainstorm',
    'blocks', 'spec', 'spec-child', 'spec-test', 'spec-lite', 'spec_lite', 'adr', 'architecture',
    'roadmap', 'specs_index', 'adr_index', 'standard', 'index',
    'structure', 'lessons', 'retrospective', 'specs_readme',
    # Add new types:
    'tool-doc', 'lesson_entry', 'pattern', 'pattern_index',
    'telemetry_feature', 'telemetry_dashboard', 'telemetry_guide',
    'telemetry_reference', 'reference'
]
```

### Option 2: Auto-Discovery Script

Use the discovery script to scan and update:

```bash
python .agents/scripts/fix-lint-doctypes.py --dry-run
python .agents/scripts/fix-lint-doctypes.py
```

## Excluding Files from Lint

For files that should be completely excluded from lint checks:

### Add to `.agentslintignore`

```text
docs/standards/checkbox-protocol.md
docs/templates/task.md
.agents/rules/RULE-*.md
```

### Or Use Directory-Level Exclusion

In the lint script, add to excluded patterns:

```python
EXCLUDED_PATTERNS = [
    '**/templates/**',
    '**/rules/**',
    '**/checkbox-protocol.md',
]
```

## Recommended Approach

### For This Project

1. **Keep examples as documentation** - Don't fix intentional examples
2. **Update validator for new types** - Run `fix-lint-doctypes.py`
3. **Accept some warnings** - Not all warnings need to be eliminated

### Target Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Errors | 0 | 0 |
| Warnings (real) | ~10 | 0 |
| Warnings (false positive) | ~87 | N/A (acceptable) |

## Verification

After updates, verify:

```bash
# Check for real issues
AFOL-native command pending; do not use legacy just command runners.

# Run full lint
AFOL-native command pending; do not use legacy just command runners.

# Verify no new errors
AFOL-native command pending; do not use legacy just command runners.
```

## Related

- [`lint-fix-scripts.md`](./lint-fix-scripts.md) - Automated fix tools
- [`checkbox-protocol.md`](./checkbox-protocol.md) - Checkbox standards
- [agents-lint-docs.py](../../scripts/agents-lint-docs.py) - Validator script

---

*Document: `docs/standards/lint-false-positives.md`*
