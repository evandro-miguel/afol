---
description: When to use Tier 3 (Platform) skill architecture for large platforms.
metadata:
  tags: "tier-3, platform, enterprise, cloudflare-pattern"
---

# Tier 3: Platform Skills

Enterprise-grade architecture for skills that cover full platforms (AWS, Cloudflare, Convex, and similar ecosystems).

## Context

Tier 3 exists for cases where a single `SKILL.md` would become too large, too noisy, and too hard to navigate. The design goal is predictable discovery: the agent first decides *which product/domain* is relevant, then loads only the product references needed to complete the task.

## When to Use

- **Entire platform**: 10+ products/services
- **1000+ lines total**: Would overwhelm context if monolithic
- **Complex decision logic**: Users start with "I need X" not "I want product Y"
- **Undocumented gotchas**: Tribal knowledge is critical

## Core Principles

- **Dispatcher first**: keep `SKILL.md` focused on routing and decision trees.
- **Progressive disclosure**: load a single product folder only when the task needs it.
- **Predictable references**: every product uses the same five-file contract.
- **Operational relevance**: include hard constraints, limits, and failure patterns.

## The Cloudflare Pattern

Based on `cloudflare-skill` by Dillon Mulroy.

### Structure

```
my-platform/
├── SKILL.md                  # Decision trees only
└── references/
    └── <product>/
        ├── README.md         # Overview, when to use
        ├── api.md            # Runtime API reference
        ├── configuration.md  # Config options
        ├── patterns.md       # Usage patterns
        └── gotchas.md        # Pitfalls, limits
```

### The 5-File Pattern

Each product directory has exactly 5 files:

| File | Purpose | When to Load |
|------|---------|--------------|
| `README.md` | Overview, when to use | Always first |
| `api.md` | Runtime APIs, methods | Implementing features |
| `configuration.md` | Config, environment | Setting up |
| `patterns.md` | Common workflows | Best practices |
| `gotchas.md` | Pitfalls, limits | Debugging |

## Authoring Workflow

1. Create or update `SKILL.md` with intent-based decision trees.
2. Pick the product folder from the tree and load `README.md` first.
3. Load only the missing references needed by the current task (`api.md`, `configuration.md`, `patterns.md`, `gotchas.md`).
4. Keep cross-links one level deep to avoid navigation loops.

## Decision Trees

The power of Tier 3 is decision trees that help the AI **choose**:

```markdown
Need to store data?
├─ Simple key-value → kv/
├─ Relational queries → d1/
├─ Large files/blobs → r2/
├─ Per-user state → durable-objects/
└─ Vector embeddings → vectorize/
```

## Slash Command Integration

Create a slash command to orchestrate:

```markdown
---
description: Load platform skill and get contextual guidance
---

## Workflow

1. Load skill: `skill({ name: 'my-platform' })`
2. Identify product from decision tree
3. Load relevant reference files based on task

| Task | Files |
|------|-------|
| New setup | README.md + configuration.md |
| Implement feature | api.md + patterns.md |
| Debug issue | gotchas.md |
```

## Quality Bar

- Decision tree branches are based on user intent, not product brand names.
- Product folders follow the same file names and section order.
- `gotchas.md` includes concrete limits/errors and recovery guidance.
- References include executable examples with fenced language tags.
- Links are relative and resolvable from the current file.

## Progressive Disclosure in Action

- **Startup**: Only name + description (~100 tokens)
- **Activation**: SKILL.md with trees (<5000 tokens)
- **Navigation**: One product's 5 files (as needed)

Result: 60+ product references without blowing context.

## Checklist

- [ ] SKILL.md contains ONLY decision trees + index
- [ ] Each product has exactly 5 files
- [ ] Decision trees cover all "I need X" scenarios
- [ ] Cross-references stay one level deep
- [ ] Slash command created for orchestration
- [ ] Every product has `gotchas.md`

## See Also

- [Tier 3 Template](../templates/tier-3-platform.md)
- [Tier 2 Architecture](../tier-2-expanded/README.md)
