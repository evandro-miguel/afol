---
description: Require gotchas files for every Tier 3 product.
metadata:
  title: Every Tier 3 Product Must Have Gotchas.md
  impact: MEDIUM
  impactDescription: "Missing gotchas leads to preventable errors"
  tags: antipatterns, tier-3, gotchas, pitfalls, limits
  appliesTo: Tier 3
---

## Every Tier 3 Product Must Have Gotchas.md

**Impact: MEDIUM**  
**Applies to:** Tier 3 only

Every product in a Tier 3 skill must have a `gotchas.md` file. This file documents pitfalls, limits, and error patterns. Missing this file means preventable issues go undocumented.

### The Rule

- Every `references/<product>/` must include `gotchas.md`
- Document hard limits (rate limits, size limits, timeouts)
- Include common errors and their solutions
- Document tribal knowledge and edge cases
- Include error messages users might encounter

### Incorrect

```text
references/
└── kv/
    ├── README.md
    ├── api.md
    ├── configuration.md
    ├── patterns.md
    └── ❌ Missing gotchas.md
```

### Correct

```markdown
# gotchas.md

---

description: "KV pitfalls and limits"
metadata:

## tags: "kv, limits, errors, gotchas"

---

## Rate Limits

- 1000 req/s per zone (hard limit)
- Exceeding returns 429 Too Many Requests

## Common Errors

**Error: "KV request failed"**

- Cause: Missing permission in token
- Fix: Add `kv:read` and `kv:write` permissions

## Edge Cases

- Keys with spaces must be URL-encoded
- Empty values are valid but count against quota
```

### Verification

- Check every `references/<product>/` has `gotchas.md`
- Verify gotchas.md contains actual pitfalls, not just "be careful"
- Look for specific error messages, limits, and numbers
- Check for "tribal knowledge" that isn't obvious

### Reference

- [Tier 3 5-File Pattern](../references/tier-3-platform/README.md)
- [Gotchas Template](../references/templates/tier-3-platform.md)
