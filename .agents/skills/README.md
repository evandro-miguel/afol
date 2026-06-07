---
doc_type: standard
id: readme
theme: skills
status: active
created_at: '2026-05-05T11:44:41+00:00'
updated_at: '2026-05-05T11:44:41+00:00'
---

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

### agentic-benchmarking

Controlled AFOL/runtime-flow live-agent benchmark design and review, including
compact plan/task/report quality scoring, token/tool efficiency, and delivery
evidence checks.

**Capabilities:**

- Define small controlled live-agent benchmark scenarios
- Score plan/task/report quality with weighted, low-token rubrics
- Keep scripted checks primary and use qualitative review only where needed
- Review token/tool efficiency, scope control, evidence, and report clarity

**Location:** `.agents/skills/agentic-benchmarking/`

### agentic-folder-sys

Operational entrypoint for installing, upgrading, validating, and operating the
scaffold plus governed `docs/plans/` sessions.

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

## Python Script Improvement Skills

These project-local skills support maintenance of the scaffold's Python scripts
and runtime. They are installed directly in `.agents/skills/` and are not part
of the universal `skills-sync` manifest.

### async-python-patterns

Asyncio and async/await guidance for non-blocking Python paths.

**Location:** `.agents/skills/async-python-patterns/`

### python-code-style

Python style, linting, naming, and documentation guidance.

**Location:** `.agents/skills/python-code-style/`

### python-design-patterns

Minimal Python design principles for cohesive, testable components.

**Location:** `.agents/skills/python-design-patterns/`

### python-mcp-server-generator

Python MCP server guidance, useful for the scaffold runtime and FastMCP
surface.

**Location:** `.agents/skills/python-mcp-server-generator/`

### python-performance-optimization

Profiling and optimization guidance for slow or memory-heavy Python code.

**Location:** `.agents/skills/python-performance-optimization/`

### python-resource-management

Context manager, cleanup, streaming, and deterministic resource handling
guidance.

**Location:** `.agents/skills/python-resource-management/`

### python-testing-patterns

Pytest, fixtures, mocking, and focused Python testing guidance.

**Location:** `.agents/skills/python-testing-patterns/`

### python-type-safety

Type hints, generics, protocols, and static checking guidance.

**Location:** `.agents/skills/python-type-safety/`

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
