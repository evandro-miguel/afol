---
description: Enforce the Tier 3 five-file product structure.
metadata:
  title: Tier 3 Must Use 5-File Pattern Per Product
  impact: CRITICAL
  impactDescription: "Tier 3 without 5-file pattern loses discoverability"
  tags: tier-3, structure, platform, 5-file-pattern
  appliesTo: Tier 3
---

## Tier 3 Must Use 5-File Pattern Per Product

**Impact: CRITICAL**  
**Applies to:** Tier 3 only

Every product in a Tier 3 (platform) skill must follow the 5-file pattern. Missing files break the progressive disclosure strategy and make the skill harder to navigate.

### The Rule

For every product `<product>/` in `references/`:

1. **`README.md`** - Product overview, when to use it
2. **`api.md`** - Runtime APIs, methods, signatures
3. **`configuration.md`** - Setup, config options, environment variables
4. **`patterns.md`** - Common workflows, best practices
5. **`gotchas.md`** - Pitfalls, limits, error patterns

All five files must exist for every product.

### Incorrect

```text
references/
└── kv/
    └── README.md
    └── api.md
    # Missing: configuration.md, patterns.md, gotchas.md
```

### Correct

```text
references/
└── kv/
    ├── README.md
    ├── api.md
    ├── configuration.md
    ├── patterns.md
    └── gotchas.md
```

### Verification

- Count files in each `references/<product>/` directory
- Must have exactly 5 files
- Files must match the naming convention exactly (case-sensitive)

### Reference

- [Tier 3 Architecture](../references/tier-3-platform/README.md)
- [Tier 3 Template](../references/templates/tier-3-platform.md)
