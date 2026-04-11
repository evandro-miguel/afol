---
description: "Markdown link health checks for ambiguous or missing local documents"
metadata:
  category: tools
  tags: "markdown, links, marksman, vscode, linting"
---

# Link Health

Use this reference when editors report:

- `ambiguous link to document`
- `link to non existent document`

## Rules for Stable Local Links

- Use explicit relative paths: `./` or `../`.
- Always point to an explicit file, not a directory.
- Keep `.md` extension in local markdown links.
- After renames/moves, update all inbound links.

## Good vs Bad

```markdown
<!-- Bad: implicit relative path -->
`API -> references/windows-api.md`

<!-- Good: explicit relative path -->
`API -> ./references/windows-api.md`

<!-- Bad: directory target -->
`Commands -> ./references/commands/`

<!-- Good: explicit file target -->
`Commands -> ./references/commands/README.md`
```

## Quick Audit Commands

Preferred repo-level checks:

```bash
bun run links:lint
bun run links:guard
```

Strict mode (includes wikilink guard):

```bash
bun run links:guard:strict
```

List local markdown links inside a skill:

```bash
skill_dir="skills/markdownlint-skill"
rg -n --pcre2 '\]\((?!https?://|mailto:|#)[^)]+\)' "$skill_dir"
```

Find links that look like directory targets:

```bash
rg -n --pcre2 '\]\((\./|\.\./)?[^)#]*?/(?=\))' skills/markdownlint-skill
```

## Remediation Workflow

1. Fix link paths relative to the current file.
2. Replace directory links with explicit `README.md` or `SKILL.md` targets.
3. Re-run lint and editor diagnostics.
4. Keep links explicit in all new docs.
