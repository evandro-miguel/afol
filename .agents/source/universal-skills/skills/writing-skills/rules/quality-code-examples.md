---
description: Require practical runnable examples in documentation.
metadata:
  title: Include Practical Code Examples
  impact: HIGH
  impactDescription: "Examples reduce implementation errors by 50%+"
  tags: quality, examples, code, documentation
  appliesTo: Tier 1, Tier 2, Tier 3
---

## Include Practical Code Examples

**Impact: HIGH**  
**Applies to:** Tier 1, Tier 2, Tier 3

Every rule, pattern, or API reference must include practical, copy-pasteable code examples. Abstract descriptions lead to incorrect implementations.

### The Rule

- Include code examples for every non-trivial concept
- Examples must be syntactically valid and runnable
- Use fenced code blocks with language tags (```typescript,```bash, etc.)
- Show both correct AND incorrect patterns when helpful
- Keep examples focused on the single concept being explained

### Incorrect

```markdown
## Using the API

The API accepts a configuration object with various options.
```

### Correct

````markdown
## Using the API

Pass a config object with required fields:

```typescript
// Correct usage
const result = api.process({
  input: 'data',
  timeout: 5000,
  retries: 3
});
```

Avoid passing undefined for required fields:

```typescript
// Incorrect - will throw
const result = api.process({
  input: undefined,  // ❌ Required!
  timeout: 5000
});
```
````

### Verification

- Scan for code blocks (```) in each reference file
- Verify language tags are present
- Test that examples are syntactically valid (if possible)
- Ensure examples match current API versions

### Reference

- [Standards Guide](../references/standards/README.md)
