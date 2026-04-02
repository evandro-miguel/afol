---
description: "lint-md Command"
metadata:
  category: tools
  tags: "file-api, ui-components, configuration, standards, formatting, linting, amp, issues"
---

# lint-md Command

Lint markdown files for errors and style violations.

## Synopsis

```bash
lint-md [options] [files/globs]
```

## Description

Runs markdownlint-cli2 on specified files with LLM-optimized configuration.
Automatically detects and uses configuration in priority order:
1. Command-line `--config` option
2. `MARKDOWNLINT_CONFIG` environment variable
3. Local `.markdownlint-cli2.jsonc`
4. Global `~/.config/llm-markdown/.markdownlint-cli2.jsonc`

## Options

### `-h, --help`
Show help message and exit.

### `-c, --config FILE`
Use specific configuration file.

```bash
lint-md -c my-config.json README.md
```

### `-s, --strict`
Exit with error code if any violations found.

```bash
lint-md "**/*.md" --strict
# Returns exit code 1 if errors found
```

### `-q, --quiet`
Only show errors, suppress success messages.

```bash
lint-md "**/*.md" --quiet
```

### `--version`
Show version information.

## Arguments

### `files/globs`
Files or glob patterns to lint.

Default: `**/*.md` (all markdown files)

Common patterns:
- `README.md` - Single file
- `"**/*.md"` - All markdown files recursively
- `docs/` - All files in directory
- `"docs/**/*.md"` - All files in docs and subdirectories

## Examples

### Basic Usage

```bash
# Lint single file
lint-md README.md

# Lint all markdown files
lint-md "**/*.md"

# Lint specific directory
lint-md docs/
```

### With Options

```bash
# Use custom config
lint-md -c ./config/markdown.json "**/*.md"

# Strict mode for CI
lint-md "**/*.md" --strict

# Quiet mode
lint-md "**/*.md" --quiet
```

### Combined Examples

```bash
# Lint with custom config, fail on errors
lint-md -c project.json "docs/**/*.md" --strict

# Check specific files quietly
lint-md README.md CONTRIBUTING.md --quiet
```

## Exit Codes

- `0` - Success (no errors, or errors ignored)
- `1` - Errors found (with `--strict`)
- `2` - Configuration or execution error

## Output Format

Default output shows:
- File path
- Line and column numbers
- Rule code (e.g., MD013)
- Error description
- Context

Example:
```
README.md:10:81 MD013/line-length Line length [Expected: 100; Actual: 150]
```

## Environment

### `MARKDOWNLINT_CONFIG`
Path to default configuration file.

```bash
export MARKDOWNLINT_CONFIG=~/my-config.json
lint-md README.md  # Uses my-config.json
```

## See Also

- [fix-md](./fix.md) - Auto-fix markdown issues
- [validate-md](./validate.md) - Validate installation
