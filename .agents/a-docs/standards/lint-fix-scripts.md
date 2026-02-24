---
doc_type: standard
id: lint-fix-scripts
theme: standards
status: active
created_at: '2026-02-24T00:00:00-03:00'
updated_at: '2026-02-24T00:00:00-03:00'
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
make lint-fix-check

# Preview fixes (dry run)
make lint-fix-dry

# Apply all fixes
make lint-fix
```

## Available Commands

| Command | Description |
|---------|-------------|
| `make lint-fix` | Apply all lint fixes |
| `make lint-fix-dry` | Preview fixes without modifying |
| `make lint-fix-check` | Check if fixes needed (exit 1 if yes) |
| `make lint-fix-checkboxes` | Fix checkbox separators only |
| `make lint-fix-frontmatter` | Add frontmatter to specific files |

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
python .agents/scripts/fix-lint-checkboxes.py .agents/a-docs/standards/

# Fix specific file
python .agents/scripts/fix-lint-checkboxes.py .agents/rules/RULE-002.md
```

### fix-lint-frontmatter.py

Adds YAML frontmatter to files missing it.

```bash
# Add frontmatter to specific files
python .agents/scripts/fix-lint-frontmatter.py \
  .agents/a-docs/standards/scripts-usage.md \
  .agents/a-docs/standards/scripts-reference.md

# With custom doc_type
python .agents/scripts/fix-lint-frontmatter.py \
  --doc-type tool-doc \
  .agents/a-docs/agentic/my-tool.md
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
   make lint-fix-check
   ```

2. **Preview changes:**
   ```bash
   make lint-fix-dry
   ```

3. **Review the files that will change**

4. **Apply fixes:**
   ```bash
   make lint-fix
   ```

5. **Verify:**
   ```bash
   make lint
   ```

### CI/CD Integration

Use `--check` mode in CI to fail if lint issues exist:

```yaml
- name: Check lint issues
  run: make lint-fix-check
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
- [Makefile](../../standards/Makefile) - Command reference

---
*Document: `.agents/a-docs/standards/lint-fix-scripts.md`*
