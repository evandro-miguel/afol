---
description: Template for writing-skills rule files.
metadata:
  title: Rule Title Here
  impact: MEDIUM
  impactDescription: Optional description of impact
  tags: tag1, tag2, tag3
  appliesTo: Tier 1, Tier 2, Tier 3
---

## Rule Title Here

**Impact: MEDIUM (optional impact description)**  
**Applies to:** Tier 1, Tier 2, Tier 3

Brief explanation of the rule and why it matters. This should be clear and concise, explaining the consequences of not following this rule.

### The Rule

State the rule clearly and concisely.

### Incorrect (what not to do)

Describe the anti-pattern or violation:

```markdown
---
# Missing frontmatter!
---

# Bad Documentation

This file lacks proper frontmatter and structure.
```

### Correct (what to do)

Show the proper implementation:

```markdown
---
description: "Use when working with X and need Y"
metadata:
  tags: "x, y, z"
---

# Good Documentation

Clear, concise content with proper examples.
```

### Verification

How to verify this rule is being followed:

- Check 1: Description of check
- Check 2: Description of check

### Reference

- [Tier 1 Architecture](../references/tier-1-simple/README.md)
- [Standards Guide](../references/standards/README.md)
