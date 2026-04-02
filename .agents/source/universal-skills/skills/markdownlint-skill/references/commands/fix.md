---
description: "fix-md Command"
metadata:
  category: tools
  tags: "code-review, links, ui-components, file-api, configuration, standards, commits, formatting"
---

# fix-md Command

Auto-fix markdown issues where possible.

## Synopsis

```bash
fix-md [options] [files/globs]
```

## Description

Runs markdownlint-cli2 with `--fix` flag to automatically correct fixable issues.

Fixable issues include:
- List indentation (MD007)
- List style (MD004)
- Emphasis style (MD049)
- Strong style (MD050)
- Multiple blanks (MD012)
- Trailing spaces (MD009)
- Missing spaces in headings (MD018, MD019)
- And more...

## Options

### `-h, --help`
Show help message and exit.

### `-c, --config FILE`
Use specific configuration file.

```bash
fix-md -c my-config.json README.md
```

### `-n, --dry-run`
Preview what would be fixed without making changes.

```bash
fix-md "**/*.md" --dry-run
```

### `-q, --quiet`
Only show summary, suppress detailed output.

```bash
fix-md "**/*.md" --quiet
```

### `--version`
Show version information.

## Arguments

### `files/globs`
Files or glob patterns to fix.

Default: `**/*.md` (all markdown files)

## Examples

### Basic Usage

```bash
# Fix single file
fix-md README.md

# Fix all markdown files
fix-md "**/*.md"

# Fix specific directory
fix-md docs/
```

### Safe Preview

```bash
# See what would change (no actual changes)
fix-md README.md --dry-run
```

### With Custom Config

```bash
# Use relaxed rules for fixing
fix-md -c relaxed.json "**/*.md"
```

## Fix Statistics

After running, shows:
- Number of files processed
- Number of fixes applied
- Remaining unfixable issues

Example output:
```
🔧 Auto-fixing Markdown files...
   Config: /home/user/.config/llm-markdown/.markdownlint-cli2.jsonc

✅ All fixable issues resolved!
```

## Non-Fixable Issues

Some issues require manual correction:
- Line length violations (MD013)
- Missing headings (MD041)
- Duplicate headings (MD024)
- Empty links (MD042)

After auto-fix, run `lint-md` to see remaining issues.

## Safety

- Creates no backups (use version control)
- Only modifies fixable issues
- Preserves file encoding
- Maintains line endings

## Best Practices

1. **Preview first**: Use `--dry-run` to see what would change
2. **Version control**: Commit before running fix
3. **Review changes**: Check git diff after fixing
4. **Run lint after**: Verify all issues resolved

## Workflow Example

```bash
# 1. Check current state
lint-md "**/*.md"

# 2. Preview fixes
fix-md "**/*.md" --dry-run

# 3. Apply fixes
fix-md "**/*.md"

# 4. Verify
lint-md "**/*.md"

# 5. Review and commit
git diff
git add -A
git commit -m "Fix markdown style issues"
```

## Exit Codes

- `0` - Success (fixes applied or nothing to fix)
- `1` - Configuration or execution error

## See Also

- [lint-md](./lint.md) - Check for issues
- [validate-md](./validate.md) - Validate installation
