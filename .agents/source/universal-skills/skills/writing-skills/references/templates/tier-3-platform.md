---
description: Template for complex Tier 3 platform skills.
metadata:
  tags: "template, tier-3, platform"
---

# Platform Name Skill

Use this template when a skill must orchestrate many products/services and cannot remain effective as a monolithic file.

## Context

Tier 3 templates separate routing (`SKILL.md`) from product knowledge (`references/<product>/...`). This keeps activation lightweight and lets the agent load only the files relevant to the current task.

## Directory Structure

```text
<platform-skill>/
├── SKILL.md                  # Dispatcher (decision trees only)
└── references/
    ├── <product-a>/
    │   ├── README.md         # Product overview and use cases
    │   ├── api.md            # Runtime APIs and contracts
    │   ├── configuration.md  # Setup, env vars, limits
    │   ├── patterns.md       # Common workflows and examples
    │   └── gotchas.md        # Pitfalls and recovery playbook
    └── <product-b>/
        ├── README.md
        ├── api.md
        ├── configuration.md
        ├── patterns.md
        └── gotchas.md
```

## SKILL.md Skeleton

```markdown
---
description: Use when working across the <platform> ecosystem and you need product-specific guidance.
metadata:
  tags: "platform, tier-3, <platform>, dispatcher"
---

# <Platform> Skill

## Decision Tree

Need to store data?
├─ Key-value access -> references/kv/README.md
├─ Relational queries -> references/sql/README.md
└─ Blob storage -> references/blob/README.md

Need compute/runtime?
├─ Stateless request handler -> references/runtime/README.md
└─ Stateful per-user actor -> references/actors/README.md
```

## Product README Skeleton

```markdown
---
description: Overview and routing guide for <product> in <platform>.
metadata:
  tags: "<platform>, <product>, tier-3"
---

# <Product>

## When to Use

- <intent-based trigger>
- <intent-based trigger>

## Task Routing

- New setup -> `configuration.md`
- Feature implementation -> `api.md` + `patterns.md`
- Incident/debugging -> `gotchas.md`
```

## Authoring Checklist

- [ ] `SKILL.md` contains decision trees and links only.
- [ ] Every product folder has all five files.
- [ ] Examples are executable and include code fences with language tags.
- [ ] `gotchas.md` documents limits, common errors, and mitigations.
- [ ] Relative links resolve from each file.

## See Also

- [Tier 3 Architecture Overview](../tier-3-platform/README.md)
- [Tier 2 Architecture](../tier-2-expanded/README.md)
