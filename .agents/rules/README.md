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

## Creating a new rule

1. Create markdown file: `<rule-name>.md`
2. Define rule clearly
3. Add examples if needed
4. Test with agents

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
