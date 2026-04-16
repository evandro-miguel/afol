# Rules

**Mandatory rules folder for all agents.**

All agent-specific rules stored here. Symlinked from agent config folders.

---

## Structure

```text
.agents/rules/
├── README.md
├── RULE-001-tool-discovery.md
├── RULE-002-workstream-creation.md
├── RULE-003-documentation-standards.md
├── RULE-004-validation-linting.md
└── RULE-005-folder-structure.md
```

---

## Active Rules

| ID | Rule | Lines | Purpose |
|----|------|-------|---------|
| **RULE-001** | [tool-discovery](./RULE-001-tool-discovery.md) | ~150 | Tool discovery & usage patterns |
| **RULE-002** | [workstream-creation](./RULE-002-workstream-creation.md) | ~140 | Creating workstreams & tasks |
| **RULE-003** | [documentation-standards](./RULE-003-documentation-standards.md) | ~150 | Frontmatter & markdown standards |
| **RULE-004** | [validation-linting](./RULE-004-validation-linting.md) | ~160 | Pre-commit validation |
| **RULE-005** | [folder-structure](./RULE-005-folder-structure.md) | ~160 | Required folder structure |

**Total:** ~760 lines across 5 focused rules (max 250 each)

---

## Quick Reference

### Before Starting Work

```bash
# RULE-001: Discover tools
./.agents/agents tools list
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
| `docs/standards/` | Human standards |
| `.agents/tools.json` | Tool catalog |
| `.agents/agents.config` | Central config |

---

*Last updated: 2026-02-23 | Rules: 5 | Total lines: ~760*
