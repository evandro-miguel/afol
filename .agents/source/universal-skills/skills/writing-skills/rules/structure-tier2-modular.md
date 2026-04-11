---
description: Enforce modular references for Tier 2 skills.
metadata:
  title: Tier 2 Must Use Modular References
  impact: CRITICAL
  impactDescription: "Tier 2 without modular structure becomes unmaintainable"
  tags: tier-2, structure, modular, references
  appliesTo: Tier 2
---

## Tier 2 Must Use Modular References

**Impact: CRITICAL**  
**Applies to:** Tier 2 only

Tier 2 (complex) skills must split content into modular reference files. The dispatcher (SKILL.md) must remain lightweight and only load specific references when needed.

### The Rule

- **`SKILL.md`** - Dispatcher only: decision trees, index of references
- **`references/`** - Modular files by topic/area
- Each reference file focuses on one specific concern
- Load references lazily based on the current task

### Incorrect

```markdown
# SKILL.md (2000+ lines)

## Section 1: Topic A

### Subsection 1.1

### Subsection 1.2

...

## Section 20: Topic Z
```

### Correct

```text
skill/
├── SKILL.md              # Dispatcher (decision trees only)
└── references/
    ├── topic-a.md        # Detailed Topic A reference
    ├── topic-b.md        # Detailed Topic B reference
    └── topic-c.md        # Detailed Topic C reference
```

**SKILL.md:**

```markdown
---
description: "Use when working with complex X"
metadata:
  tags: "x, complex"
---

# X Skill

## Decision Tree

Need to do A? -> references/topic-a.md
Need to do B? -> references/topic-b.md
```

### Verification

- `SKILL.md` should be < 500 lines (ideally < 300)
- `references/` directory must exist with multiple `.md` files
- Each reference file should have frontmatter with tags

### Reference

- [Tier 2 Architecture](../references/tier-2-expanded/README.md)
