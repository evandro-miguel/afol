---
description: "validate-md Command"
metadata:
  category: tools
  tags: "file-api, dependencies, validation, setup, configuration, standards, api-testing, functions"
---

# validate-md Command

Validate markdownlint-skill installation and configuration.

## Synopsis

```bash
validate-md [options]
```

## Description

Runs comprehensive tests to verify:

- markdownlint-cli2 is installed
- Configuration files exist
- Commands work correctly
- Auto-fix functionality works

## Options

### `-h, --help`

Show help message and exit.

### `-v, --verbose`

Show detailed system information.

```bash
validate-md --verbose
```

### `--version`

Show version information.

## Tests Performed

1. **Dependency Check**
   - Verifies markdownlint-cli2 is installed
   - Shows version if found

2. **Global Config Check**
   - Verifies global config exists at `~/.config/llm-markdown/.markdownlint-cli2.jsonc`

3. **Local Config Check**
   - Checks for local `.markdownlint-cli2.jsonc` (optional)

4. **Valid Markdown Test**
   - Creates properly formatted markdown
   - Verifies it passes linting

5. **Invalid Markdown Test**
   - Creates markdown with intentional errors
   - Verifies errors are detected

6. **Auto-fix Test**
   - Creates markdown with fixable errors
   - Applies auto-fix
   - Verifies errors are reduced

## Output

### Success

```text
🔍 Validating markdownlint-skill installation...

Testing: markdownlint-cli2 installation
✅ PASS: markdownlint-cli2 found (v0.20.0)

Testing: Global configuration
✅ PASS: Global config exists at /home/user/.config/llm-markdown/.markdownlint-cli2.jsonc

...

📊 Test Summary:
  Passed: 6
  Failed: 0

✅ All validation tests passed!
   markdownlint-skill is ready to use.
```

### Failure

```text
🔍 Validating markdownlint-skill installation...

Testing: markdownlint-cli2 installation
❌ FAIL: markdownlint-cli2 not found...

📊 Test Summary:
  Passed: 0
  Failed: 1

⚠️  Some validation tests failed.
   Please fix the issues above.
```

## Verbose Output

With `--verbose`, shows:

- Global config path and status
- Local config path and status
- CLI version
- Installation details

## Exit Codes

- `0` - All tests passed
- `1` - One or more tests failed

## When to Use

### First Time Setup

```bash
# After installation
validate-md
```

### Troubleshooting

```bash
# Check if everything works
validate-md --verbose
```

### CI/CD

```bash
# Ensure tools are available
validate-md || exit 1
```

## Fixing Issues

### markdownlint-cli2 not found

```bash
# Install globally
bun add -g markdownlint-cli2
```

### Global config not found

```bash
# Create config directory
mkdir -p ~/.config/llm-markdown

# Create default config (copy from skill)
cp ~/.config/opencode/skills/markdownlint-skill/config/.markdownlint-cli2.jsonc \
   ~/.config/llm-markdown/
```

## See Also

- [lint-md](./lint.md) - Lint markdown files
- [fix-md](./fix.md) - Auto-fix markdown issues
