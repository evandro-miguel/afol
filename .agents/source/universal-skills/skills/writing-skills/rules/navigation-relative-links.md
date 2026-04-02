---
description: Require relative resolvable links across skill docs.
metadata:
  title: Links Must Be Relative and Resolvable
  impact: MEDIUM-HIGH
  impactDescription: "Broken links break knowledge navigation"
  tags: navigation, links, relative-paths, cross-references
  appliesTo: Tier 1, Tier 2, Tier 3
---

## Links Must Be Relative and Resolvable

**Impact: MEDIUM-HIGH**  
**Applies to:** Tier 1, Tier 2, Tier 3

All internal links must use relative paths that resolve from the current file's location. Broken links break the knowledge graph and confuse agents.

### The Rule

- Use relative paths: `../other/file.md` not `/absolute/path/file.md`
- Links must resolve from the file containing the link
- Cross-references should stay one level deep where possible
- Verify links before committing changes

### Path Reference

```
skill/
├── SKILL.md                          # Root level
├── references/
│   ├── topic-a.md                    # references level
│   └── subfolder/
│       └── topic-b.md                # deeper level
```

- From `SKILL.md`: `references/topic-a.md`
- From `references/topic-a.md`: `../SKILL.md` or `subfolder/topic-b.md`
- From `references/subfolder/topic-b.md`: `../topic-a.md` or `../../SKILL.md`

### Incorrect

```markdown
Go to API: /home/user/skills/my-skill/references/api.md
Go to Topic: ../wrong/path/topic.md
Go Somewhere: file-that-does-not-exist.md
```

### Correct

```markdown
[API Reference](../references/standards/README.md)
[Related Topic](../references/tier-2-expanded/README.md)
[See Also](../references/templates/tier-3-platform.md)
```

### Verification

- Run: `bun run skills/doc-standards/cli.ts check` (includes link validation)
- Manually verify a sample of links in each reference directory
- Check for dead links in `gotchas.md` (often overlooked)

### Reference

- [Tier 3 Navigation](../references/tier-3-platform/README.md)
