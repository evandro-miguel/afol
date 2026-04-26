# Rules

**Mandatory rules folder for all agents.**

All agent-specific rules stored here. Symlinked from agent config folders.

---

## Structure

```text
.agents/rules/
├── README.md
├── RULE-002-workstream-creation.md
├── RULE-003-documentation-standards.md
├── RULE-004-validation-linting.md
├── RULE-005-folder-structure.md
├── RULE-006-applicable-rule-resolution.md
└── RULE-007-postmortem-governance-review.md
```

---

## Active Rules

| ID | Rule | Lines | Purpose |
|----|------|-------|---------|
| **RULE-002** | [workstream-creation](./RULE-002-workstream-creation.md) | ~160 | Creating workstreams, decision intake & tasks |
| **RULE-003** | [documentation-standards](./RULE-003-documentation-standards.md) | ~150 | Frontmatter & markdown standards |
| **RULE-004** | [validation-linting](./RULE-004-validation-linting.md) | ~160 | Pre-commit validation |
| **RULE-005** | [folder-structure](./RULE-005-folder-structure.md) | ~160 | Required folder structure |
| **RULE-006** | [applicable-rule-resolution](./RULE-006-applicable-rule-resolution.md) | ~150 | Required rule/skill/spec routing by touched element |
| **RULE-007** | [postmortem-governance-review](./RULE-007-postmortem-governance-review.md) | ~100 | Final postmortem promotion review before closure |

**Total:** ~880 lines across 6 focused rules (max 250 each)

---

## Quick Reference

### Before Starting Work

```bash
# RULE-006: Identify element type and applicable rules before edits
# Use docs/standards/decision-intake.md before benchmark/planning for ambiguous or product-shaped work
```

### Creating New Work

```bash
# RULE-002: Create workstream
./.agents/agents new <theme> --spec
```

### Documentation

```bash
# RULE-003: Frontmatter required
# Every .md file needs YAML frontmatter
```

### Before Commits

```bash
# RULE-004: Validate
just doctor && just lint && just verify
```

### Structure

```bash
# RULE-005: All agent files in .agents/
```

### Postmortem Closure

```bash
# RULE-007: Final postmortem must complete Governance Promotion Review
./.agents/agents wb-update status --session <session-id> --file postmortem --value final
```

---

## Rule Format

```markdown
---
id: RULE-XXX
theme: <rule-theme>
version: 1.0
created: YYYY-MM-DD
applies_to: All agents
---

# Rule Title

**Purpose:** Clear one-liner.

---

## Section

Content here.

---

## Best Practices

**DO:** ✅ Actions to take
**DON'T:** ❌ Actions to avoid
```

---

## Creating New Rules

1. **Check line count** - Max 250 lines, ideal ~150
2. **Single responsibility** - One topic per rule
3. **Create file:** `RULE-XXX-<theme>.md`
4. **Add frontmatter** - id, theme, version, created, applies_to
5. **Use tables** - For quick reference
6. **Include examples** - Code blocks with commands
7. **Add Best Practices** - DO/DON'T sections
8. **Link references** - Related rules and docs
9. **Update this README** - Add to Active Rules table
10. **Test** - Ensure agents can access

---

## Enforcement

**Automated:**

- `just doctor` - Structure validation
- `just lint` - Documentation linting
- `just verify` - Task completion check

**Self-check:**

- Agents should validate before commits
- Report validation results

**Human review:**

- Pre-merge validation gates
- CI/CD pipelines

---

## References

| Location | Content |
|----------|---------|
| `docs/agentic/` | Tool documentation |
| `docs/agentic/agents-tools.md` | Optional tool discovery reference |
| `docs/standards/` | Human standards |
| `.agents/tools.json` | Tool catalog |
| `.agents/agents.config` | Central config |

---

*Last updated: 2026-04-23 | Rules: 6 | Total lines: ~840*
