# Skills System

Skills define capabilities and behaviors for AI agents operating in this repository.

## Overview

Skills are modular definitions that provide:

- **Prompt templates** - Standardized prompts for specific tasks
- **Rules** - Operational rules for agents
- **Examples** - Usage examples and best practices

## Structure

```text
.agents/skills/
├── README.md                 # This file
├── <skill-name>/
│   ├── SKILL.md             # Skill definition
│   ├── prompts/             # Prompt templates
│   ├── rules/               # Skill rules
│   └── examples/            # Usage examples
```

## Available Skills

### agentic-folder-sys

Operational entrypoint for installing, upgrading, validating, and operating the
scaffold plus governed `.agents/wb/` sessions.

**Capabilities:**

- Bootstrap a new or existing repo with the scaffold
- Run the git-backed skills refresh and upstream PR proposal flow
- Follow governed workbench execution and validation
- Keep plans, tasks, reports, logs, templates, and closure evidence aligned

**Location:** `.agents/skills/agentic-folder-sys/`

### agentic-scaffold-mcp

Runtime MCP lane for compact scaffold inspection, search, validation, safe archiving, reversible text writes, reversible patches, and undo.

**Capabilities:**

- Generate compact scaffold manifests
- Search docs, maps, workbench artifacts, and skills
- Validate required scaffold structure
- Use archive/write/patch/undo through the central runtime and FastMCP adapter

**Location:** `.agents/skills/agentic-scaffold-mcp/`

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
./.agents/agents skills-sync ensure agentic-folder-sys --runtime codex --pull

# Or individual commands
./.agents/agents skills-sync pull
./.agents/agents skills-sync apply --skills=new-skill

# Propose a locally edited skill back through a branch/PR
./.agents/agents skills-sync push new-skill --branch skills-sync/new-skill --commit --push --pr
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
- `.agents/skills/agentic-folder-sys/` - Canonical scaffold and workbench operation skill
- `.agents/agents.config` - Skills configuration

---

*Document: `.agents/skills/README.md`*
