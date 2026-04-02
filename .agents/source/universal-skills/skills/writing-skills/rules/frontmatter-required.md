---
description: Require frontmatter metadata for all skill markdown files.
metadata:
  title: Every Markdown File Must Have Frontmatter
  impact: CRITICAL
  impactDescription: "Skills fail to load without valid frontmatter"
  tags: frontmatter, metadata, compliance
  appliesTo: Tier 1, Tier 2, Tier 3
---

## Every Markdown File Must Have Frontmatter

**Impact: CRITICAL**  
**Applies to:** Tier 1, Tier 2, Tier 3

Every `.md` file in a skill must include YAML frontmatter with a `description` field and `metadata.tags`. Missing frontmatter breaks skill loading, RAG indexing, and prevents the agent from discovering the file's purpose.

### The Rule

- Every `.md` file must start with frontmatter delimited by `---`
- Must include: `description: "..."` (plain single-line string)
- Must include: `metadata: tags: "tag1, tag2"` (comma-separated string)
- **Never** use YAML multiline `|-` or `>` syntax

### Incorrect

```markdown
# My Skill

This file has no frontmatter.
```

```markdown
---
# Using multiline syntax - WRONG
---

# My Skill
```

### Correct

```markdown
---
description: "Use when working with React components"
metadata:
  tags: "react, components, frontend"
---

# My Skill

Clear description and tags help agents find this file.
```

### Verification

- Run: `bun run skills/doc-standards/cli.ts check`
- Check that all `.md` files in `skills/*/references/**/*.md` have frontmatter
- Verify `description` field exists and is a string (not array)
- Verify `metadata.tags` exists and is a comma-separated string

### Reference

- [Skill Structure](../references/tier-1-simple/README.md)
- [Frontmatter Standards](../SKILL.md)
