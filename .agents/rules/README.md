# Rules

This is the **mandatory** rules folder for all agents.

All agent-specific rules should be stored here and symlinked from agent config folders.

## Structure

```
.agents/rules/
├── <rule-name>.md
└── README.md
```

## Usage

Agents access rules via symlinks:
- `.claude/rules/default` → `../../.agents/rules`
- `.qwen/rules/` → `../../.agents/rules/`

## Active Rules

| Rule ID | Name | Purpose |
|---------|------|---------|
| RULE-001 | [agents-operations-rule.md](./agents-operations-rule.md) | **Mandatory:** How to work with .agents system |

### RULE-001: Agents Operations

**Applies to:** All agents (QWEN, CLAUDE, GEMINI)

**Covers:**
- Tool discovery and usage patterns
- Workstream creation and naming conventions
- Folder structure requirements
- Documentation standards (frontmatter, status, timeline)
- Linting and validation workflows
- Tool-specific guidelines
- Workflow patterns (standard, quick, bugfix)
- Makefile quick reference
- Health metrics and troubleshooting
- Best practices (DO/DON'T)

**Key Requirements:**
1. ALWAYS run `.agents/agents tools list` before starting work
2. Use `make new THEME=x` to create workstreams
3. Run `make doctor` + `make lint` + `make verify` before commits
4. Follow frontmatter and task marker conventions
5. Use `.agents/a-docs/agentic/` for tool documentation

## Creating a new rule

1. Create markdown file: `<rule-name>.md`
2. Define rule clearly
3. Add examples if needed
4. Test with agents
5. Update this README with new rule

## Rules format

```markdown
# Rule Name

## Description
Clear description of the rule.

## Examples
- Good: example
- Bad: anti-pattern

## Enforcement
How this rule is enforced.
```

---
*Mandatory rules folder: `.agents/rules/`*
