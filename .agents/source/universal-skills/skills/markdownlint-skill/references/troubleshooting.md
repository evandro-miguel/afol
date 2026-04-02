---
description: "Troubleshooting"
metadata:
  category: tools
  tags: "husky, links, refs, ui-components, file-api, language, setup, second"
---

# Troubleshooting

## Common Errors

### Error: "Command not found: markdownlint-cli2"

**Cause**: Package not installed or not in PATH

**Solution**:
```bash
# Install dependencies
bun install

# Or run with bunx
bunx markdownlint-cli2 "**/*.md"
```

---

### Error: "Cannot find module 'markdownlint/style/prettier'"

**Cause**: markdownlint not installed

**Solution**:
```bash
bun add -d markdownlint-cli2
```

Verify installation:
```bash
ls node_modules/markdownlint/style/
```

---

### Error: "Too many violations" on existing project

**Cause**: Existing files don't meet the strict standard

**Solutions**:

1. **Auto-fix what you can**:
```bash
bun run lint:md:fix
```

2. **Gradual adoption** - Temporarily disable problematic rules:
```jsonc
{
  "config": {
    "extends": "markdownlint/style/prettier",
    "MD013": false,  // Disable during migration
    "MD024": false
  }
}
```

3. **Ignore legacy files**:
```jsonc
{
  "ignores": [
    "docs/legacy/**",
    "old-*.md"
  ]
}
```

---

### Error: "Conflicts with Prettier"

**Cause**: markdownlint and Prettier have conflicting rules

**Solution**: Use Prettier-compatible base:

```jsonc
{
  "config": {
    "extends": "markdownlint/style/prettier"
  }
}
```

Then run Prettier first, markdownlint second:

```bash
prettier --write "**/*.md"
markdownlint-cli2 --fix "**/*.md"
```

---

### Error: "Pre-commit hook too slow"

**Cause**: Linting all files instead of just staged

**Solution**: Use lint-staged:

**package.json**:
```json
{
  "lint-staged": {
    "*.md": "markdownlint-cli2 --fix"
  }
}
```

**.husky/pre-commit**:
```bash
bunx lint-staged
```

---

### Error: "MD013/line-length" on URLs

**Cause**: Long URLs exceed line length

**Solution**: Configure line-length to be less strict:

```jsonc
"line-length": {
  "line_length": 100,
  "strict": false,  // Allow long URLs
  "stern": false
}
```

Or use reference-style links:

```markdown
[Link][1]

[1]: https://very-long-url-that-exceeds-the-line-length-limit.com/path/to/resource
```

---

### Error: "MD024/no-duplicate-heading" in CHANGELOG

**Cause**: CHANGELOGs naturally have duplicate headings (versions)

**Solution**: Ignore CHANGELOG or use siblings_only:

```jsonc
{
  "config": {
    "no-duplicate-heading": {
      "siblings_only": true
    }
  },
  "ignores": [
    "CHANGELOG.md"
  ]
}
```

---

### Error: "MD033/no-inline-html" for badges

**Cause**: Badges use HTML img tags

**Solution**: Allow specific elements:

```jsonc
"no-inline-html": {
  "allowed_elements": ["img", "br", "details", "summary"]
}
```

---

### Error: CI fails but local passes

**Cause**: Different versions or configs

**Solution**:

1. Lock versions in package.json:
```json
{
  "devDependencies": {
    "markdownlint-cli2": "0.17.2"
  }
}
```

2. Use exact same Node/Bun version:
```yaml
# .github/workflows/ci.yml
- uses: oven-sh/setup-bun@v1
  with:
    bun-version: 1.0.0  # Pin version
```

3. Clear cache:
```bash
rm -rf node_modules bun.lockb
bun install
```

---

### Error: "Cannot read config file"

**Cause**: Invalid JSON/JSONC syntax

**Solution**: Validate config:

```bash
# Check for comments (JSONC allows them)
cat .markdownlint-cli2.jsonc | python3 -m json.tool

# Or use jq (remove comments first)
cat .markdownlint-cli2.jsonc | sed 's|//.*||g' | jq .
```

Common issues:
- Trailing commas (not allowed in JSON, allowed in JSONC)
- Comments (use `//` not `#`)
- Missing quotes around keys

---

## Debug Mode

Get detailed output:

```bash
# Show all files being linted
markdownlint-cli2 --showFound "**/*.md"

# Verbose output
markdownlint-cli2 "**/*.md" 2>&1 | head -50
```

## Getting Help

1. **Check rule documentation**: Each error includes a URL
2. **Run with specific file**: Narrow down issues
3. **Test with minimal config**: Isolate configuration problems
4. **Check version compatibility**: `markdownlint-cli2 --version`

## Quick Fixes

| Error | Quick Fix |
|-------|-----------|
| MD013 (line too long) | Break line at word boundary |
| MD022 (no blank around heading) | Add blank line before/after |
| MD004 (wrong list style) | Change `*` to `-` |
| MD040 (no code language) | Add language after backticks |
| MD012 (multiple blanks) | Remove extra blank lines |
| MD024 (duplicate heading) | Make headings unique |
| MD042 (empty link) | Add URL or remove link |
