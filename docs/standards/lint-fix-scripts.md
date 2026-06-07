---
doc_type: standard
id: lint-fix-scripts
theme: standards
status: active
created_at: '2026-02-24T00:00:00-03:00'
updated_at: '2026-04-13T19:37:00-03:00'
---

# Lint Fix Scripts

Automated tools for fixing common markdown lint issues.

## Overview

The lint fix scripts automatically resolve the most common markdown validation warnings:

1. **Missing checkbox separators** - `- [x]text` → `- [x] text`
2. **Missing YAML frontmatter** - Add frontmatter to files without it
3. **Unknown doc_types** - Update validator to recognize new types

## Quick Start

```bash
# Check for issues (no modifications)
AFOL-native command pending; do not use legacy just command runners.

# Preview fixes (dry run)
AFOL-native command pending; do not use legacy just command runners.

# Apply all fixes
AFOL-native command pending; do not use legacy just command runners.
```

## Available Commands

| Command | Description |
|---------|-------------|
| `just lint-fix` | Apply all lint fixes |
| `just lint-fix-dry` | Preview fixes without modifying |
| `just lint-fix-check` | Check if fixes needed (exit 1 if yes) |
| `just lint-fix-checkboxes` | Fix checkbox separators only |
| `just lint-fix-frontmatter` | Add frontmatter to specific files |

## Scripts

### fix-lint-all.py

Unified script that runs all fix operations.

```bash
# Check for issues
python .agents/scripts/fix-lint-all.py --check

# Preview fixes
python .agents/scripts/fix-lint-all.py --dry-run

# Apply fixes
python .agents/scripts/fix-lint-all.py .agents
```

### fix-lint-checkboxes.py

Fixes missing separators after checkbox markers.

**Problem:** `- [x]text` should be `- [x] text`

```bash
# Dry run
python .agents/scripts/fix-lint-checkboxes.py --dry-run .agents/

# Fix specific directory
python .agents/scripts/fix-lint-checkboxes.py docs/standards/

# Fix specific file
python .agents/scripts/fix-lint-checkboxes.py .agents/rules/RULE-002.md
```

### fix-lint-frontmatter.py

Adds YAML frontmatter to files missing it.

```bash
# Add frontmatter to specific files
python .agents/scripts/fix-lint-frontmatter.py \
  docs/standards/scripts-usage.md \
  docs/standards/scripts-reference.md

# With custom doc_type
python .agents/scripts/fix-lint-frontmatter.py \
  --doc-type tool-doc \
  docs/agentic/my-tool.md
```

### fix-lint-doctypes.py

Updates the lint validator to recognize new doc_type values found in markdown files.

```bash
# Scan and preview updates
python .agents/scripts/fix-lint-doctypes.py --dry-run

# Apply updates
python .agents/scripts/fix-lint-doctypes.py
```

## Common Issues Fixed

### Missing Checkbox Separator

**Before:**

```text
- [x]Task without space
- [ ]Another task
```

**After:**

```text
- [x] Task with space
- [ ] Another task
```

### Missing Frontmatter

**Before:**

```markdown
# My Document

Content here...
```

**After:**

```markdown
---
doc_type: standard
id: my-document
theme: docs
status: active
created_at: '2026-02-24T00:00:00-03:00'
updated_at: '2026-02-24T00:00:00-03:00'
---

# My Document

Content here...
```

## Workflow

### Recommended Workflow

1. **Before fixing:**

   ```bash
AFOL-native command pending; do not use legacy just command runners.
   ```

2. **Preview changes:**

   ```bash
AFOL-native command pending; do not use legacy just command runners.
   ```

3. **Review the files that will change**

4. **Apply fixes:**

   ```bash
AFOL-native command pending; do not use legacy just command runners.
   ```

5. **Verify:**

   ```bash
AFOL-native command pending; do not use legacy just command runners.
   ```

### CI/CD Integration

Use `--check` mode in CI to fail if lint issues exist:

```yaml
- name: Check lint issues
  run: afol validate
  continue-on-error: false
```

## Exclusions

The scripts automatically exclude:

- `.venv/`
- `node_modules/`
- `.git/`
- `cache/`
- `__pycache__/`

## Safety

- All scripts support `--dry-run` for preview
- Original files are only modified when explicitly running without dry-run
- UTF-8 encoding is preserved
- Errors are reported but don't stop processing

## Troubleshooting

### Script not found

Ensure you're in the project root:

```bash
cd /path/to/project
python .agents/scripts/fix-lint-all.py --check
```

### Permission denied

Make scripts executable:

```bash
chmod +x .agents/scripts/fix-lint-*.py
```

### False positives in code examples

The checkbox fixer may modify code blocks. Review changes before committing:

```bash
git diff
```

## Related

- [`lint.md`](./lint.md) - Lint validation standards
- [`checkbox-protocol.md`](./checkbox-protocol.md) - Checkbox state markers
- [AFOL command reference](./scripts-reference.md) - Canonical command reference

---

*Document: `docs/standards/lint-fix-scripts.md`*
