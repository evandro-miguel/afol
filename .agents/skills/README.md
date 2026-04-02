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

### agentic-system-workflow

Operational entrypoint for installing, upgrading, validating, and operating the
scaffold.

**Capabilities:**
- Bootstrap a new or existing repo with the scaffold
- Run the git-backed skills refresh and publish flow
- Follow governed workbench execution and validation

**Location:** `.agents/skills/agentic-system-workflow/`

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
# One-step update from universal-skills into .agents/skills/
make skills-sync SKILLS=new-skill
make skills-update SKILLS=new-skill

# Ensure the scaffold-operating skill is available locally
./.agents/agents skills-sync ensure agentic-system-workflow --runtime codex --pull

# Or individual commands
./.agents/agents skills-sync pull
./.agents/agents skills-sync apply --skills=new-skill

# Publish a locally edited skill back to the git-backed source
./.agents/agents skills-sync push new-skill --commit --push
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
- `.agents/skills/agentic-system-workflow/` - Canonical scaffold operation skill
- `.agents/agents.config` - Skills configuration

---
*Document: `.agents/skills/README.md`*
