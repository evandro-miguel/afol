---
description: Require intent-based routing in Tier 2 and Tier 3.
metadata:
  title: Decision Trees Must Use Intent-Based Language
  impact: HIGH
  impactDescription: "Intent-based routing improves task completion by 40%"
  tags: routing, decision-tree, tier-2, tier-3, dispatcher
  appliesTo: Tier 2, Tier 3
---

## Decision Trees Must Use Intent-Based Language

**Impact: HIGH**  
**Applies to:** Tier 2, Tier 3

Dispatchers (SKILL.md) must use intent-based decision trees. Users express what they need ("I need X"), not which product/service they want. Decision trees should reflect user intent, not product names.

### The Rule

- Start with "Need to...?" or "Want to...?" questions
- Branch options describe outcomes, not product names
- Only at the leaf nodes reference specific files
- Avoid forcing users to know product names upfront

### Incorrect

```markdown
## Decision Tree

Which product?
├─ KV -> references/kv/README.md
├─ D1 -> references/d1/README.md
└─ R2 -> references/r2/README.md
```

**Problem:** Users don't know what "KV", "D1", or "R2" are.

### Correct

```markdown
## Decision Tree

Need to store data?
├─ Simple key-value access -> references/kv/README.md
├─ Relational SQL queries -> references/d1/README.md
└─ Large files/blobs -> references/r2/README.md
```

**Good:** Users know what they need; the tree routes them.

### Verification

- Review all "Decision Tree" sections in SKILL.md files
- Verify branches describe user intent, not product names
- Ensure at least 3-5 "I need X" scenarios are covered
- Check that leaf nodes link to specific reference files

### Reference

- [Tier 3 Decision Trees](../references/tier-3-platform/README.md)
- [Tier 2 Modular Structure](../references/tier-2-expanded/README.md)
