---
name: markdownlint-skill
description: Use when linting, fixing, or validating Markdown files. Provides global commands lint-md, fix-md, and validate-md for consistent markdown formatting across all projects and LLM outputs.
metadata:
  category: code-quality
  tags: "markdown, linting, markdownlint, documentation, formatting, bun, global-commands"
  triggers: "lint markdown, fix markdown, validate markdown, markdown errors, standardize markdown, check markdown, markdownlint, .md lint, format markdown, markdown style"
---
# Markdownlint Skill 📝

Global markdown linting system for consistent formatting across all projects and LLM outputs.

## ⚡ Quick Navigation

| Area | Purpose | Reference |
|------|---------|-----------|
| **Commands** | CLI usage & options | [Commands](./references/commands/README.md) |
| **Setup** | Installation & configuration | [Setup Guide](references/setup/) |
| **Rules** | Rule reference & customization | [Rules](references/rules/) |
| **Gotchas** | Troubleshooting & common issues | [Gotchas](./gotchas.md) |

## 🛠️ Commands

| Command | Purpose | Example |
|---------|---------|---------|
| `validate-md` | Check installation | `validate-md --verbose` |
| `lint-md` | Lint markdown files | `lint-md "**/*.md"` |
| `fix-md` | Auto-fix issues | `fix-md README.md --dry-run` |

## 🎯 Usage Protocol

1. **Validate**: Run `validate-md` to check installation
2. **Lint**: Use `lint-md` to check files for issues
3. **Fix**: Run `fix-md` to auto-correct problems
4. **Verify**: Lint again to confirm all issues resolved

## When to Use

- Linting markdown files for errors and style issues
- Auto-fixing common markdown problems
- Validating markdownlint installation and configuration
- Standardizing LLM-generated markdown output
- Enforcing consistent documentation style
- Pre-commit quality checks

## How It Works

- Commands are installed globally in `~/.local/bin/`
- Configuration follows priority: CLI flag → env var → local → global
- Strict rules optimized for LLM output consistency
- Auto-fix handles 85%+ of common issues

## ⚡ Quick Start

```bash
# 1. Check installation
validate-md

# 2. Lint a file
lint-md README.md

# 3. Auto-fix issues
fix-md README.md

# 4. Verify
lint-md README.md
```

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Command not found | Add `export PATH="$HOME/.local/bin:$PATH"` to shell profile |
| Too many errors on existing files | Run `fix-md "**/*.md"` first, then review remaining |
| Config changes not applied | Check which config is active with `validate-md --verbose` |
| Prettier conflicts | Use `extends: "markdownlint/style/prettier"` in config |
| Line length errors on URLs | Use reference-style links or disable strict mode |

## Configuration Priority

1. Command-line `--config` option
2. `MARKDOWNLINT_CONFIG` environment variable
3. Local `.markdownlint-cli2.jsonc`
4. Global `~/.config/llm-markdown/.markdownlint-cli2.jsonc`
5. Built-in defaults

## Key Rules

| Rule | Description | Auto-fix |
|------|-------------|----------|
| MD013 | Line length (100 chars) | No |
| MD001 | Heading increment | No |
| MD041 | First line heading | No |
| MD040 | Fenced code language | No |
| MD004 | UL style (dash) | Yes |
| MD049 | Emphasis style (*) | Yes |
| MD050 | Strong style (**) | Yes |
| MD012 | No multiple blanks | Yes |

## Examples

### Lint Specific Files
```bash
lint-md README.md CONTRIBUTING.md
```

### Fix All Markdown in Project
```bash
fix-md "**/*.md"
```

### Strict CI Check
```bash
lint-md "**/*.md" --strict || exit 1
```

### Check Before Commit
```bash
lint-md "**/*.md" --quiet || {
  echo "Markdown errors found. Run: fix-md '**/*.md'"
  exit 1
}
```

## Integration with LLMs

### Post-process LLM Output
```bash
echo "$LLM_OUTPUT" > output.md
fix-md output.md
lint-md output.md --strict
```

### System Prompt Addition
```
Format all markdown with:
- Max 100 chars per line
- Use dashes for lists (-)
- Use asterisks for emphasis (*)
- Always specify language in code blocks
- One blank line between sections
```

## References

- [lint-md command](./references/commands/lint.md)
- [fix-md command](./references/commands/fix.md)
- [validate-md command](./references/commands/validate.md)
- [Gotchas & Troubleshooting](./gotchas.md)

## See Also

- [bun-skill](../bun-skill/SKILL.md) - Bun runtime usage
- [writing-skills](../writing-skills/SKILL.md) - Skill creation patterns

