---
name: writing-skills
description: Use when creating, updating, or standardizing agent skills with tier-based architecture and quality gates.
metadata:
  category: meta
  tags: "skill-writing, meta-skill, standards, automation"
  triggers: "new skill, create skill, update skill, skill template, standardize skill, tier 1, tier 2, tier 3"
  references: "standards, cso, anti-rationalization, testing, templates, tier-1-simple, tier-2-expanded, tier-3-platform"
---
# Writing Skills

Dispatcher for skill creation and maintenance with a strict tier-based workflow.

## Mandatory Contract

- Every `.md` file must include YAML frontmatter.
- `SKILL.md` must use `name`, `description`, and `metadata`.
- `metadata.tags`, `metadata.triggers`, and `metadata.references` use CSV strings.
- `description` must be single-line and should start with `Use when`.
- Do not use YAML multiline syntax (`>-`, `|-`).
- Script examples and scaffolds must be Bun-first (`bun <script>`), not `node <script>`.
- Do not document static "preferred model" lists for agents; use dynamic discovery via `opencode models`.
- Before creating or modifying skills, the universal mirror must be in sync:
```bash
bun skills/writing-skills/scripts/check-universal-skills-sync.js
```

See [Standards](./references/standards/README.md) for the canonical contract.

## Quick Decision Tree

### 1) Create a new skill

- Single concept, lightweight, frequently loaded -> [Tier 1](./references/tier-1-simple/README.md)
- Multi-concept with modular references -> [Tier 2](./references/tier-2-expanded/README.md)
- Platform-level with many products/services -> [Tier 3](./references/tier-3-platform/README.md)

### 2) Improve an existing skill

- Low discoverability or wrong activation -> [CSO](./references/cso/README.md)
- Agents bypassing mandatory rules -> [Anti-Rationalization](./references/anti-rationalization/README.md)
- Overgrown monolithic content -> [Tier 2/Tier 3 restructuring](./references/templates/tier-3-platform.md)
- Weak reliability under pressure -> [Testing Guide](./references/testing/README.md)

### 3) Enforce compliance

- Validate all markdown + tier structure:
```bash
bun skills/writing-skills/scripts/check-skill.js skills/<skill-name> --tier <1|2|3>
```
- Auto-fix frontmatter issues:
```bash
bun skills/writing-skills/scripts/fix-skill.js skills/<skill-name> --all-md
```

## Standardized Creation Workflow

1. Pick tier using the decision tree.
2. Run overlap advisor (candidate mode) to detect merge/combine opportunities.
3. Scaffold with the tier-aware script.
4. Fill content using the correct template family.
5. Apply CSO to description/triggers.
6. Add anti-rationalization sections for discipline skills.
7. Run validation and fixers until clean.
8. Test skill behavior with RED-GREEN-REFACTOR scenarios.
9. If changes touch agent models in OpenCode repos, validate against runtime catalog:
```bash
python3 scripts/check-agent-models.py --base .
```

### Tier-aware scaffolding

```bash
# Pre-check overlap against existing skills
bun skills/writing-skills/scripts/skill-advisor.js candidate --name my-skill --tier 2

# Tier 1
bun skills/writing-skills/scripts/create-skill.js --name my-skill --tier 1 --type technique

# Tier 2
bun skills/writing-skills/scripts/create-skill.js --name my-skill --tier 2

# Tier 3
bun skills/writing-skills/scripts/create-skill.js --name my-platform --tier 3 --products core,api,data
```

Creation flags:
- `--advice warn` (default): show merge/combine suggestions.
- `--advice enforce`: block creation on high duplicate risk.
- `--advice off`: skip advisor.

## Component Index

| Component | Purpose |
|-----------|---------|
| [Standards](./references/standards/README.md) | Canonical frontmatter contract and tier rules. |
| [CSO](./references/cso/README.md) | Discovery optimization for skill triggering. |
| [Anti-Rationalization](./references/anti-rationalization/README.md) | Loophole-closing for discipline skills. |
| [Testing](./references/testing/README.md) | RED-GREEN-REFACTOR validation process. |
| [Best Practices](./references/best-practices/README.md) | Degrees of freedom and progressive disclosure. |
| [Templates](./references/templates/README.md) | Technique/reference/discipline/pattern and Tier 3 examples. |
| [Rules](./rules/_sections.md) | Enforceable rule groups by impact. |

## Related Skills for End-to-End Quality

- [doc-coauthoring](../doc-coauthoring/SKILL.md) for structured collaborative writing workflows.
- [doc-standards](../doc-standards/SKILL.md) for document-level structural consistency.
- [markdownlint-skill](../markdownlint-skill/SKILL.md) for markdown lint/fix commands.
- [llm-markdown-skill](../llm-markdown-skill/SKILL.md) for strict LLM markdown pipelines.

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Workflow in `description` | Use trigger-based `Use when ...` wording only. |
| Tier 2 logic inside large monolithic `SKILL.md` | Move details to `references/` files. |
| Tier 3 products missing one of the 5 files | Enforce `README/api/configuration/patterns/gotchas`. |
| Array syntax in `tags/triggers/references` | Convert to CSV strings via `fix-skill.js`. |
| Cross-link chains deeper than one level | Keep direct links from dispatcher to target references. |

## Pre-Deploy Checklist

- [ ] `name` matches folder name exactly.
- [ ] `SKILL.md` is uppercase and valid.
- [ ] `description` starts with `Use when`.
- [ ] `metadata.tags/triggers` are CSV strings.
- [ ] Tier structure matches 1/2/3 contract.
- [ ] `check-skill.js` passes with `--tier`.
- [ ] Trigger and behavior scenarios pass.
- [ ] No broken relative links.
- [ ] `skill-advisor.js candidate` reviewed and merge decisions documented.

## Optional Sync Workflow

When mirroring skills between repositories, use:

```bash
./skills/writing-skills/scripts/sync-skill.sh --list
./skills/writing-skills/scripts/sync-skill.sh <skill-name>
```

