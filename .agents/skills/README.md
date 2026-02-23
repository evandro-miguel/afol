# Skills System

Skills define capabilities and behaviors for AI agents operating in this repository.

## Overview

Skills are modular definitions that provide:
- **Prompt templates** - Standardized prompts for specific tasks
- **Rules** - Operational rules for agents
- **Examples** - Usage examples and best practices

## Structure

```
.agents/skills/
├── README.md                 # This file
├── <skill-name>/
│   ├── SKILL.md             # Skill definition
│   ├── prompts/             # Prompt templates
│   ├── rules/               # Skill rules
│   └── examples/            # Usage examples
```

## Available Skills

### writing-skills

Writing and documentation skills.

**Capabilities:**
- Technical writing
- Documentation standards
- Markdown formatting

**Location:** `.agents/skills/writing-skills/`

### markdownlint-skill

Markdown linting and validation.

**Capabilities:**
- Markdown linting
- Format validation
- Auto-fix capabilities

**Location:** `.agents/skills/markdownlint-skill/`

## Adding New Skills

### Manual Addition

1. Create directory: `.agents/skills/<skill-name>/`
2. Create `SKILL.md` with definition
3. Add prompts, rules, examples
4. Update this README

### Via Skills Sync

```bash
# Sync from universal-skills
make skills-sync SKILLS=new-skill

# Or individual commands
./.agents/agents skills-sync pull
./.agents/agents skills-sync apply --skills=new-skill
```

## Skill Definition Format

```markdown
# Skill: <name>

## Purpose
What this skill enables.

## Capabilities
- Capability 1
- Capability 2

## Prompts
Prompt templates for common tasks.

## Rules
Operational rules for agents.

## Examples
Usage examples.
```

## Related

- [agents-skills-sync.md](../agentic/agents-skills-sync.md) - Skills synchronization
- `.agents/agents.config` - Skills configuration

---
*Document: `.agents/skills/README.md`*
