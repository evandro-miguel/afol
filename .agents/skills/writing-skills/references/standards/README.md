---
description: Standards and naming rules for creating agent skills.
metadata:
  tags: "standards, naming, yaml, structure"
---

# Skill Development Guide

Comprehensive reference for creating effective agent skills.

## Canonical Skill Contract

Use this contract for all skill files in `skills/<skill-name>/`.

### SKILL.md frontmatter

```yaml
---
name: my-skill
description: Use when [specific trigger condition].
metadata:
  category: technique
  tags: "tag-a, tag-b, tag-c"
  triggers: "trigger-a, trigger-b, trigger-c"
  references: "core, patterns, troubleshooting"
---
```

### Supporting markdown frontmatter

```yaml
---
description: Short retrieval summary for this file.
metadata:
  tags: "topic-a, topic-b"
---
```

### Required rules

- `description` must be a single line.
- `description` should start with `Use when` for `SKILL.md`.
- `metadata.tags`, `metadata.triggers`, and `metadata.references` use CSV strings.
- Do not use YAML array syntax for `tags`, `triggers`, or `references`.
- Do not use YAML multiline syntax (`>-`, `|-`).

## Runtime and Automation Standard

- JS/TS automation examples must use Bun execution (`bun path/to/script.js`).
- For executable JS/TS scripts, use shebang `#!/usr/bin/env bun`.
- Do not introduce new `node <script>` examples in skill docs or generated templates.

## Agent Model Policy (OpenCode Repos)

- Do not maintain static model allowlists or "preferred model" pools inside skill docs.
- Treat the CLI catalog as source of truth: `opencode models`.
- Validate agent frontmatter model ids using:

```bash
python3 scripts/check-agent-models.py --base .
```

## Universal Pool Sync Gate

Before creating or modifying any skill in `skills/`, verify that
`apps/universal-skills/skills` is synchronized:

```bash
bun skills/writing-skills/scripts/check-universal-skills-sync.js
```

## Directory Structure

```
~/.config/opencode/skills/
  {skill-name}/           # kebab-case, matches `name` field
    SKILL.md              # Required: main skill definition
    references/           # Optional: supporting documentation
      README.md           # Sub-topic entry point
      *.md                # Additional files
```

**Project-local alternative:**
```
.agent/skills/{skill-name}/SKILL.md
```

## Tier Structure Matrix

| Tier | Use Case | Required Structure |
|------|----------|--------------------|
| Tier 1 | Single concept | `SKILL.md` only |
| Tier 2 | Multi-concept | `SKILL.md`, `gotchas.md`, `references/` |
| Tier 3 | Platform-level | `SKILL.md`, `references/<product>/` with 5 files each |

Tier 3 product folders must include:

- `README.md`
- `api.md`
- `configuration.md`
- `patterns.md`
- `gotchas.md`

## Naming Rules

| Element | Rule | Example |
|---------|------|---------|
| Directory | kebab-case, 1-64 chars | `react-best-practices` |
| `SKILL.md` | ALL CAPS, exact filename | `SKILL.md` (not `skill.md`) |
| `name` field | Must match directory name | `name: react-best-practices` |

## SKILL.md Structure

```markdown
---
name: {skill-name}
description: Describes purpose and trigger condition.
metadata:
  category: technique
  triggers: keyword1, keyword2, error-text
---

# Skill Title

Brief description of what this skill does.

## When to Use

- Symptom or situation A
- Symptom or situation B

## How It Works

Step-by-step instructions or reference content.

## Examples

Concrete usage examples.

## Common Mistakes

What to avoid and why.
```

## Description Best Practices

The `description` field is critical for skill discovery:

```yaml
# ❌ BAD: Workflow summary (agent skips reading full skill)
description: Analyzes code, finds bugs, suggests fixes

# ✅ GOOD: Trigger conditions only
description: Use when debugging errors or reviewing code quality.
metadata:
  triggers: bug, error, code review
```

**Rules:**
- Start with "Use when..."
- Put triggers under `metadata.triggers`
- Keep under 500 characters
- Use third person (not "I" or "You")

## Compatibility Note

`doc-standards` frontmatter (`id/type/desc/created/updated`) is for generic documentation files.
Skill files follow the contract in this guide (`name/description/metadata` for `SKILL.md`).

## Context Efficiency

Skills load into context on-demand. Optimize for token usage:

| Guideline | Reason |
|-----------|--------|
| Keep SKILL.md < 500 lines | Reduces context consumption |
| Put details in supporting files | Agent reads only what's needed |
| Use tables for reference data | More compact than prose |
| Link to `--help` for CLI tools | Avoids duplicating docs |

## Supporting Files

For complex skills, use additional files:

```
my-skill/
  SKILL.md              # Overview + navigation
  patterns.md           # Detailed patterns
  examples.md           # Code examples
  troubleshooting.md    # Common issues
```

**Supporting file frontmatter is required** (for any `.md` besides `SKILL.md`):

```markdown
---
description: Short summary used for search and retrieval.
metadata:
  tags: "pattern, troubleshooting, api"
  source: internal
---
```

This frontmatter helps the LLM locate the right file when referenced from `SKILL.md`.

Reference from SKILL.md:
```markdown
## Detailed Reference

- [Patterns](patterns.md) - Common usage patterns
- [Examples](examples.md) - Code samples
```

## Skill Types

| Type | Purpose | Example |
|------|---------|---------|
| **Reference** | Documentation, APIs | `bigquery-analysis` |
| **Technique** | How-to guides | `condition-based-waiting` |
| **Pattern** | Mental models | `flatten-with-flags` |
| **Discipline** | Rules to enforce | `test-driven-development` |

## Automation Workflow

### Advisor gate before creation

```bash
# Candidate overlap analysis (suggest merge/combine)
bun skills/writing-skills/scripts/skill-advisor.js candidate --name my-skill --tier 2

# Block creation on high duplicate risk
bun skills/writing-skills/scripts/create-skill.js --name my-skill --tier 2 --advice enforce

# Portfolio-wide merge/consolidation scan
bun skills/writing-skills/scripts/skill-advisor.js scan --root skills
```

### Create standardized skeleton by tier

```bash
bun skills/writing-skills/scripts/create-skill.js --name my-skill --tier 1
bun skills/writing-skills/scripts/create-skill.js --name my-skill --tier 2
bun skills/writing-skills/scripts/create-skill.js --name my-platform --tier 3 --products core,api
```

### Validate skill

```bash
bun skills/writing-skills/scripts/check-skill.js skills/my-skill --tier 2
```

### Auto-fix frontmatter issues

```bash
bun skills/writing-skills/scripts/fix-skill.js skills/my-skill --all-md
```

## Verification Checklist

Before deploying:

- [ ] `name` matches directory name?
- [ ] `SKILL.md` is ALL CAPS?
- [ ] Description starts with "Use when..."?
- [ ] Triggers listed under metadata?
- [ ] `tags/triggers/references` use CSV strings?
- [ ] Under 500 lines?
- [ ] Tested with real scenarios?
