# Skills

This is the **mandatory** skills folder for all agents.

All agent-specific skills should be stored here and symlinked from agent config folders.

## Available Skills

| Skill | Purpose |
|-------|---------|
| (none yet) | Create when user requests |

## Structure

```
.agents/skills/
├── <skill-name>/
│   ├── __init__.py
│   ├── skill.py
│   └── README.md
└── README.md
```

## Usage

Agents access skills via symlinks:
- `.qwen/skills` → `.agents/skills`
- `.opencode/skills` → `.agents/skills`
- `.codex/skills` → `.agents/skills`
- `.claude/skills` → `.agents/skills`

## Creating a new skill

1. Create folder: `mkdir <skill-name>`
2. Add skill implementation
3. Add documentation
4. Test with all agents

## Rules

- Skills must be agent-agnostic
- Document dependencies clearly
- Test across all agent platforms

---
*Mandatory skills folder: `.agents/skills/`*
