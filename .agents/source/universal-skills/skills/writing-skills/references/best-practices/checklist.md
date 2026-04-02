---
description: Pre-deploy QA gate for skill quality assurance.
metadata:
  tags: "checklist, qa, validation"
---

# Skill Quality Checklist

Verify before sharing or deploying a skill.

## Core Quality

### Metadata
- [ ] `name`: kebab-case, matches directory name
- [ ] `description`: Starts with "Use when...", under 1024 chars
- [ ] `metadata.triggers`: List of activation keywords

### Structure
- [ ] SKILL.md body under 500 lines
- [ ] File references one level deep max
- [ ] No Windows-style paths (`\`)
- [ ] All links are relative and valid

### Content
- [ ] Examples are concrete, not abstract
- [ ] No time-sensitive information (or marked deprecated)
- [ ] Consistent terminology throughout
- [ ] No placeholder text ("TODO", "TBD", etc.)

---

## Code & Scripts (if applicable)

### Error Handling
- [ ] Scripts handle errors explicitly (no "punt to agent")
- [ ] Helpful error messages with context
- [ ] Graceful degradation when possible

### Configuration
- [ ] No "voodoo constants" (all values documented)
- [ ] Required packages listed explicitly
- [ ] Installation commands provided

### Quality
- [ ] Scripts have docstrings/comments
- [ ] Clear input/output format documented
- [ ] Validation steps for critical operations

---

## Testing

### Coverage
- [ ] At least 3 evaluation scenarios created
- [ ] Tested with different model sizes (small/medium/large)
- [ ] Edge cases documented

### Validation
- [ ] Real usage scenarios tested
- [ ] Failure modes identified and handled
- [ ] Feedback loops included for quality-critical tasks

---

## Quick Validation Commands

**Script-Based (Recommended):**
```bash
# Guard: local skills and universal mirror must match
bun .agents/skills/writing-skills/scripts/check-universal-skills-sync.js

# Suggest merge/combine before creating a new skill
bun skills/writing-skills/scripts/skill-advisor.js candidate --name <skill-name> --tier <1|2|3>

# Validate tier + markdown contract
bun skills/writing-skills/scripts/check-skill.js skills/<skill-name> --tier <1|2|3>

# Auto-fix common issues (arrays, >-)
bun skills/writing-skills/scripts/fix-skill.js skills/<skill-name> --all-md

# Periodic consolidation scan for existing skills
bun skills/writing-skills/scripts/skill-advisor.js scan --root skills
```

**OpenCode Model Gate (when touching `agent/*.md`):**
```bash
# Dynamic model catalog from runtime
opencode models

# Block agent models not present in catalog
python3 scripts/check-agent-models.py --base .
```

**Official Debugger:**
```bash
# Check for critical errors (YAML, tags, structure)
opencode debug skill

# Check specific agent config
opencode debug agent <agent-name>
```

**Manual Checks:**
```bash
# Check YAML frontmatter
head -20 SKILL.md

# Count lines (should be < 500)
wc -l SKILL.md
```

---

## See Also

- [Best Practices](./README.md): Degrees of Freedom and patterns
- [Gotchas](../../gotchas.md): Common mistakes to avoid
