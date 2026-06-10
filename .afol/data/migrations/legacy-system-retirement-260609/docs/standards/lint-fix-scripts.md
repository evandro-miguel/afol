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
afol validate --changed-path docs

# Preview fixes (dry run)
# No public AFOL lint-fix dry-run verb exists yet.
# Factory-only compatibility scripts remain in the scaffold repo.

# Apply all fixes
# No public AFOL lint-fix apply verb exists yet.
# Factory-only compatibility scripts remain in the scaffold repo.
```

## Available Commands

No public AFOL lint-fix command exists yet. Legacy just targets and Python
scripts are factory-only migration debt and must not be copied into downstream
usage docs.

## Scripts

### Factory-only `fix-lint-all.py`

Unified script that runs all fix operations.

```bash
# Check for issues
# Factory-only script-backed command pending AFOL-native migration.

# Preview fixes
# Factory-only script-backed command pending AFOL-native migration.

# Apply fixes
# Factory-only script-backed command pending AFOL-native migration.
```

### Factory-only `fix-lint-checkboxes.py`

Fixes missing separators after checkbox markers.

**Problem:** `- [x]text` should be `- [x] text`

```bash
# Dry run
# Factory-only script-backed command pending AFOL-native migration.

# Fix specific directory
# Factory-only script-backed command pending AFOL-native migration.

# Fix specific file
# Factory-only script-backed command pending AFOL-native migration.
```

### Factory-only `fix-lint-frontmatter.py`

Adds YAML frontmatter to files missing it.

```bash
# Add frontmatter to specific files
# Factory-only script-backed command pending AFOL-native migration.

# With custom doc_type
# Factory-only script-backed command pending AFOL-native migration.
```

### Factory-only `fix-lint-doctypes.py`

Updates the lint validator to recognize new doc_type values found in markdown files.

```bash
# Scan and preview updates
# Factory-only script-backed command pending AFOL-native migration.

# Apply updates
# Factory-only script-backed command pending AFOL-native migration.
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
   afol validate --changed-path docs/standards/lint-fix-scripts.md
   ```

2. **Preview changes:**

   ```bash
   # Factory-only compatibility scripts remain in the scaffold repo.
   ```

3. **Review the files that will change**

4. **Apply fixes:**

   ```bash
   # Factory-only compatibility scripts remain in the scaffold repo.
   ```

5. **Verify:**

   ```bash
   afol validate --changed-path docs
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

### Legacy Script not found

Ensure you're in the project root:

```bash
cd /path/to/project
# Factory-only script-backed command pending AFOL-native migration.
```

### Permission denied

Make scripts executable:

```bash
# factory-only script-backed command pending AFOL-native migration
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
