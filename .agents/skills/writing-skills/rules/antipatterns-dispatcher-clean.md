---
description: Keep dispatcher focused on routing and intent trees.
metadata:
  title: Dispatcher Must Not Include Implementation Details
  impact: MEDIUM
  impactDescription: "Implementation in dispatcher causes bloat"
  tags: antipatterns, dispatcher, separation-of-concerns, routing
  appliesTo: Tier 2, Tier 3
---

## Dispatcher Must Not Include Implementation Details

**Impact: MEDIUM**  
**Applies to:** Tier 2, Tier 3

The dispatcher (`SKILL.md`) must focus on routing and decision trees only. Implementation details belong in reference files. Mixing concerns wastes context.

### The Rule

- `SKILL.md` contains: Decision trees, file index, quick reference
- `SKILL.md` does NOT contain: API details, code examples, configuration specs
- Implementation details go in `references/*.md` files
- Load references lazily based on the task

### Incorrect

````markdown
---
description: "Platform dispatcher"
---

# Platform Skill

## Decision Tree
...

## API Reference  # ❌ WRONG! This should be in references/

### Method: processData

Accepts: `{ input: string, timeout: number }`
Returns: `{ result: any, status: 'success' | 'error' }`

Example:
```typescript
const result = await processData({
  input: 'test',
  timeout: 5000
});
```
````

### Correct

**SKILL.md:**
```markdown
---
description: "Platform dispatcher"
---

# Platform Skill

## Decision Tree

Need to process data? -> references/api.md
```

**references/api.md:**
```markdown
---
description: "API reference for processing"
---

## processData

Details, examples, everything here...
```

### Verification

- `SKILL.md` should be < 500 lines
- Check for code blocks in `SKILL.md` (should be minimal)
- Look for sections titled "API", "Configuration", "Examples" in dispatcher
- These should be in `references/`

### Reference

- [Tier 3 Dispatcher Pattern](../references/tier-3-platform/README.md)
- [Tier 2 Modular Structure](../references/tier-2-expanded/README.md)
