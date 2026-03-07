---
doc_type: standard
id: agents-template-01
created_at: "YYYY-MM-DDTHH:MM:SSZ"
updated_at: "YYYY-MM-DDTHH:MM:SSZ"
status: draft
---

# AGENTS.md template

## Project Overview

`{project_name}` is a scaffold repository that provides an agentic workflow system for LLM-assisted development. It standardizes workstreams, docs, telemetry, and tool usage across projects.

## Current Stack

- **Languages:** Python 3.11+
- **Runtime/CLI:** Python scripts and a Makefile-driven command wrapper
- **Package/tool manager:** uv (for Python environment and dependency management), make
- **Data/config formats:** YAML, JSON, Markdown, TOML

## Repo Structure

- `.agents/scripts/`: core agent CLI tools and helpers (automation, sync, verification, telemetry)
- `.agents/a-docs/`: standards, templates, telemetry docs, and process documentation
- `.agents/wb/`: workbench sessions (plans, tasks, logs, reports)
- `.agents/rules/`: operational rules and checks
- `.agents/data/`: telemetry data and schemas
- `.agents/skills/`: local skill definitions used by the system
- `.agents/cache/`: cached external skill and tooling metadata
- `.agents/agents.config`: system configuration
- `README.md`: project-level entry guide

## Important Files

- `.agents/agents` (`AGENTS` CLI wrapper)
- `.agents/a-docs/templates/` (management and doc templates)
- `.agents/scripts/` (runtime scripts and CLI implementations)
- `.agents/wb/` (active and historical work sessions)

## General Rules

### Self-Improvement Loop

- After any user correction, create one lesson file in `.agents/a-docs/lessons/entries/`
- Add a prevention rule to avoid repeating the same mistake
- Add guardrails when feasible (tests, assertions, lint rules, CI checks)
- Review relevant lessons before starting significant work

### Verification Before Done

- Never mark work complete without proof
- Compare intended behavior vs actual behavior
- Run verification commands and capture evidence
- Mandatory gate: `make lint` must pass before considering the task complete
- Ask: `Would this pass a strict senior/staff review?`
- Deterministic verification: evidence over assumptions

### Demand Elegance (Balanced)

- For non-trivial changes, evaluate if there is a cleaner design
- If the solution is hacky, refactor to a maintainable one
- Avoid over-engineering simple tasks / Simplicity first: minimal necessary change
- Keep diffs small, clear, and reviewable

### Autonomous Bug Fixing

- Reproduce or explain why reproduction is blocked
- Identify root cause first, not only symptoms (no temporary patch as final solution)
- Implement fix + guardrail when feasible
- Verify and report symptom, cause, fix, and proof
- Minimal blast radius: touch only what is required

### Safety Rules

- Never expose secrets in code, logs, docs, or commits
- Avoid destructive operations unless explicitly authorized
- Do not add dependencies without clear justification
- Archive before delete under `.agents/z-arq/YYYYMMDD_<description>/`

### a-docs Boundary Rule

- `.agents/a-docs/` is documentation-only
- Do not use it for runtime state, caches, mirrors, generated artifacts, or operational data
- Operational state must live outside `.agents/a-docs/` (for example: `.agents/cache/`, `.agents/wb/`)

### Language Policy

- Write all repository artifacts in English by default
- Use Portuguese only when explicitly requested by the user
- Keep identifiers, docs, reports, and operational notes consistent with this rule

### Metadata Update Policy (Mandatory)

- Never edit `updated_at` manually in managed docs
- Always update `updated_at` via automation commands/scripts
- Preferred commands:
  - `make wb-touch`
  - `./.agents/agents wb-update touch`
  - `./.agents/agents wb-update touch --file <path>`

## Agent Sync

- This file is the source for generated agent docs in this repo (`QWEN.md`, `CLAUDE.md`, `GEMINI.md`).
- Keep generic operational guidance in sync here and add repo-specific detail in this file.
