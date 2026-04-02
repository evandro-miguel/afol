---
description: Core patterns for high-performance skill writing based on industry best practices.
metadata:
  tags: "best-practices, degrees-of-freedom, progressive-disclosure"
---

# Skill Best Practices

Patterns for writing skills that perform consistently across different model sizes and contexts.

## Degrees of Freedom

Control how much autonomy you give the agent. Calibrate based on task criticality.

### Low Freedom (Strict)
Use when precision is critical. Agent follows exact steps.

```markdown
## Deploy Process
1. Run `bun run build`
2. Run `bun run test`
3. If tests pass, run `bun run deploy`
4. Verify deployment at https://example.com/health
```

**When to use:** CI/CD, database migrations, security-critical operations.

### Medium Freedom (Guided)
Provide structure but allow agent judgment for implementation details.

```markdown
## API Integration
1. Create auth client using project credentials
2. Implement retry logic (3 attempts, exponential backoff)
3. Add error handling for rate limits and auth failures
4. Log all API responses for debugging
```

**When to use:** Feature implementation, refactoring, integrations.

### High Freedom (Autonomous)
Define the outcome, let agent determine approach.

```markdown
## Goal
Improve page load time by 40%.

## Constraints
- Maintain visual parity
- No breaking changes to public API
- Changes must pass existing tests
```

**When to use:** Optimization, exploration, creative tasks.

---

## Progressive Disclosure Patterns

Keep SKILL.md under 500 lines. Use these patterns to manage complexity.

### Pattern 1: Simple (Single File)
Everything in one SKILL.md. Best for Tier 1 skills.

```
skill-name/
└── SKILL.md  (< 200 lines)
```

### Pattern 2: Bundled (Reference Files)
Main file + supporting docs. Best for Tier 2 skills.

```
skill-name/
├── SKILL.md  (< 300 lines, links to references)
└── references/
    ├── api.md
    └── examples.md
```

### Pattern 3: Conditional (Decision Tree)
Load only what's needed. Best for Tier 3 skills.

```
skill-name/
├── SKILL.md  (decision tree only, < 100 lines)
└── references/
    ├── product-a/README.md
    ├── product-b/README.md
    └── shared/patterns.md
```

---

## Description Writing

The `description` field is critical for discovery. Follow these rules:

### Format
```yaml
description: Use when [specific trigger condition].
```

### Examples
```yaml
# ✅ GOOD
description: Use when deploying Cloudflare Workers with wrangler and environment bindings.

# ❌ BAD (workflow summary)
description: Deploys workers and validates bindings.

# ❌ BAD (uses >- syntax - OpenCode doesn't support)
description: >-
  Some multiline description
```

### Checklist
- [ ] Starts with "Use when..."
- [ ] Contains trigger conditions, not workflow summary
- [ ] Under 1024 characters
- [ ] No version numbers (they become outdated)
- [ ] Single line (no `>-` or multiline)

---

## See Also

- [Checklist](./checklist.md): Pre-deploy QA gate
- [Anti-Rationalization](../anti-rationalization/README.md): Making discipline skills bulletproof
- [Testing](../testing/README.md): RED-GREEN-REFACTOR for skills
