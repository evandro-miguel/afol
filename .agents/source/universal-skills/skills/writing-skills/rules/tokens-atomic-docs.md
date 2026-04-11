---
description: Keep docs atomic to preserve context quality.
metadata:
  title: Keep Documentation Atomic (~512 tokens)
  impact: MEDIUM
  impactDescription: "Large files waste context window"
  tags: tokens, atomic, size-limits, context-management
  appliesTo: Tier 1, Tier 2, Tier 3
---

## Keep Documentation Atomic (~512 tokens)

**Impact: MEDIUM**  
**Applies to:** Tier 1, Tier 2, Tier 3

Keep individual documentation files small and focused. Default target is ~512 tokens per file. Large files consume context window that could be used for the actual task.

### The Rule

- Default target: ~512 tokens per file
- Reference files (adr, index) can be ~1024 tokens
- If a file exceeds the limit, split it into multiple files
- Each file should cover one specific topic or concern

### Estimating Token Count

Rough approximation: ~1.3 tokens per word (English text)

| File Size | Words | Tokens |
|-----------|-------|--------|
| Small | 200 | ~260 |
| Target | 400 | ~512 |
| Large | 800 | ~1024 |

### Incorrect

```text
references/
└── huge-api-reference.md  # 3000+ lines, covers everything
```

### Correct

```text
references/
├── api-overview.md       # High-level concepts (~300 words)
├── api-authentication.md # Auth specifics (~250 words)
├── api-error-handling.md # Errors & debugging (~350 words)
└── api-examples.md       # Code examples (~400 words)
```

### Verification

- Run: `wc -w file.md` to count words
- Target: < 400 words for regular files, < 800 for large references
- Review files > 100 lines for potential splitting
- Check: `bun run skills/doc-standards/cli.ts check`

### Reference

- [Tier 2 Architecture](../references/tier-2-expanded/README.md)
