---
name: markdownlint-skill
description: Use when linting, fixing, or validating Markdown files. Provides global commands lint-md, fix-md, and validate-md for consistent markdown formatting across all projects and LLM outputs.
metadata:
  category: code-quality
  tags: "markdown, linting, markdownlint, documentation, formatting, bun, global-commands, llm, standardization, ai-pipeline"
  triggers: "lint markdown, fix markdown, validate markdown, markdown errors, standardize markdown, check markdown, markdownlint, .md lint, format markdown, markdown style, standardize llm markdown output, lint markdown from ai, bun markdownlint setup, llm markdown consistency, validate ai generated markdown"
---

# Markdownlint Skill 📝

Global markdown quality system for formatting + link integrity across all projects and LLM outputs.

## ⚡ Quick Navigation

| Area | Purpose | Reference |
|------|---------|-----------|
| **Commands** | CLI usage & options | [Commands](./references/commands/README.md) |
| **Setup** | Installation & configuration checks | [validate-md](./references/commands/validate.md) |
| **Rules** | Rule behavior and practical overrides | [Gotchas](./gotchas.md) |
| **Link Health** | Prevent ambiguous/missing doc links | [Link Health](./references/link-health.md) |
| **Gotchas** | Troubleshooting & common issues | [Gotchas](./gotchas.md) |

## 🛠️ Commands

| Command | Purpose | Example |
|---------|---------|---------|
| `validate-md` | Check installation | `validate-md --verbose` |
| `lint-md` | Lint markdown files | `lint-md "**/*.md"` |
| `fix-md` | Auto-fix issues | `fix-md README.md --dry-run` |
| `bun run md:lint` | Baseline markdownlint for skills repos | `bun run md:lint` |
| `bun run links:lint` | External/local links lint (`lychee` or fallback) | `bun run links:lint` |
| `bun run links:guard` | Local markdown link integrity guard | `bun run links:guard` |
| `bun run lint:docs:full` | Full docs lint pipeline | `bun run lint:docs:full` |
| `bun run lint:docs:full:strict` | Strict pipeline (includes strict markdown + wikilink checks) | `bun run lint:docs:full:strict` |
| `bun run notes:lint` | Lint plans/tasks/notes/workbench docs | `bun run notes:lint` |
| `bun run notes:lint:strict` | Strict lint for plans/tasks/notes | `bun run notes:lint:strict` |

## 🎯 Usage Protocol

1. **Structure**: Run `md:lint` (baseline) for markdown style
2. **Links**: Run `links:lint` to catch broken links (HTTP/local)
3. **Skill-specific**: Run `links:guard` for explicit local link rules
4. **Verify**: Use `lint:docs:full` (or `:strict`) before push/CI

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
| "link to non existent document" in editor | Ensure target file exists and use explicit relative links (`./` or `../`) |

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
bun run lint:docs:full
```

### Strict Gate

```bash
bun run lint:docs:full:strict
```

## Integration with LLMs

### Post-process LLM Output

```bash
echo "$LLM_OUTPUT" > output.md
fix-md output.md
lint-md output.md --strict
```

### System Prompt Addition

```text
Format all markdown with:
- Max 100 chars per line
- Use dashes for lists (-)
- Use asterisks for emphasis (*)
- Always specify language in code blocks
- One blank line between sections
```

## LLM Pipeline Integration

### ⚡ Quick Decision Tree

```text
Need to standardize LLM markdown?
├── Setting up new project?
│   └── Follow "Bun Setup" in ./references/bun-setup.md
│
├── Processing existing LLM output?
│   ├── Few files → Run `bun run lint:md:fix`
│   ├── Many files → Batch process with script
│   └── CI/CD pipeline → Add validation step
│
├── Integrating with LLM API?
│   └── See "Pattern 1: Post-Processing Hook" in ./references/llm-pipeline-integration.md
│
└── Troubleshooting failures?
    └── Check ./references/troubleshooting.md
```

### Integration Patterns

#### Pattern 1: Post-Processing Hook

Process LLM output before saving/using:

```typescript
// src/llm-markdown-processor.ts
import { $ } from 'bun';

export async function processLLMMarkdown(options: {
  content: string;
  autoFix?: boolean;
  strict?: boolean;
}) {
  const { content, autoFix = true, strict = false } = options;
  const tempFile = `/tmp/llm-${Date.now()}.md`;
  await Bun.write(tempFile, content);

  try {
    if (autoFix) {
      await $`markdownlint-cli2 --fix ${tempFile}`;
    }
    await $`markdownlint-cli2 ${tempFile}`;
    const processed = await Bun.file(tempFile).text();
    await $`rm ${tempFile}`;
    return { success: true, content: processed };
  } catch (error) {
    await $`rm -f ${tempFile}`;
    if (strict) throw new Error('Markdown validation failed');
    return { success: false, content };
  }
}
```

#### Pattern 2: Git Pre-commit Hook

Automatically fix markdown on commit via lint-staged:

```json
{
  "lint-staged": {
    "*.md": ["markdownlint-cli2 --fix", "git add"]
  }
}
```

#### Pattern 3: CI/CD Gate

Block PRs with invalid markdown:

```yaml
# .github/workflows/markdown.yml
name: Markdown Lint
on: [push, pull_request]
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun run lint:md
```

### LLM Markdown Best Practices

1. **Fail Fast**: Run lint early in CI pipeline
2. **Auto-fix**: Enable auto-fix in pre-commit hooks
3. **Strict Mode**: Use `--strict` for production content
4. **System Prompts**: Include formatting rules in LLM prompts

## References

- [lint-md command](./references/commands/lint.md)
- [fix-md command](./references/commands/fix.md)
- [validate-md command](./references/commands/validate.md)
- [Link Health](./references/link-health.md)
- [Gotchas & Troubleshooting](./gotchas.md)
- [Bun Setup Guide](./references/bun-setup.md) *(from llm-markdown-skill)*
- [LLM Pipeline Integration](./references/llm-pipeline-integration.md) *(from llm-markdown-skill)*
- [Rule Reference](./references/rule-reference.md) *(from llm-markdown-skill)*
- [Troubleshooting](./references/troubleshooting.md) *(from llm-markdown-skill)*

## See Also

- [bun-skill](../bun-skill/SKILL.md) - Bun runtime usage
- [writing-skills](../writing-skills/SKILL.md) - Skill creation patterns
- [husky-skill](skill://husky-skill) - Git hooks setup
