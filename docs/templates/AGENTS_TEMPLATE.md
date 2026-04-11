---
doc_type: standard
id: agents-template-01
created_at: YYYY-MM-DDTHH:MM:SSZ
updated_at: '2026-04-02T14:44:30-03:00'
status: draft
---

# AGENTS.md template

## Project Overview

`{project_name}` is a scaffold repository that provides an agentic workflow system for LLM-assisted development. It is intended for interactive agent runtimes that work through terminal-first CLI products such as Codex CLI, OpenCode, Gemini CLI, Claude Code, and similar environments. It standardizes workstreams, docs, telemetry, and tool usage across projects.

## Current Stack

- **Languages:** Python 3.11+
- **Runtime/CLI:** Python scripts, runtime adapter docs for interactive agent CLIs, and a Makefile-driven command wrapper
- **Package/tool manager:** uv (for Python environment and dependency management), make
- **Data/config formats:** YAML, JSON, Markdown, TOML

## Runtime Positioning

- This scaffold is optimized for interactive agent execution inside CLI tools, not for embedding a standalone agent SDK into an application backend.
- Runtime folders and adapter files should stay thin, secret-free, and focused on interactive execution compatibility.
- Prefer governance, tooling, and docs changes that improve interactive terminal workflows.

## Repo Structure

- `docs/`: project-owned documentation, repository mapping, and other non-agent project docs
- `.agents/scripts/`: core agent CLI tools and helpers (automation, sync, verification, telemetry)
- `docs/`: standards, templates, telemetry docs, and process documentation
- `.agents/wb/`: workbench sessions (plans, tasks, logs, reports)
- `.agents/rules/`: operational rules and checks
- `.agents/data/`: telemetry data and schemas
- `.agents/skills/`: local skill definitions used by the system
- `.agents/cache/`: cached external skill and tooling metadata
- `.agents/agents.config`: system configuration
- `README.md`: project-level entry guide

## Important Files

- `.agents/agents` (`AGENTS` CLI wrapper)
- `docs/templates/` (management and doc templates)
- `.agents/scripts/` (runtime scripts and CLI implementations)
- `.agents/wb/` (active and historical work sessions)

## General Rules

### Self-Improvement Loop

- After any user correction, create one lesson file in `docs/lessons/entries/`
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

### Planning Intelligence (Mandatory For Major Work)

- For major work, the workbench plan file is an ExecPlan and must follow `PLANS.md`
- The canonical ExecPlan path is `.agents/wb/<session_id>/<session_id>_plan_01.md`
- ExecPlans must stay self-contained and living: keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current while work proceeds
- Major plans must link to a brainstorm artifact before the plan can be considered complete
- Major plans must link to an explorer-check artifact proving the current repo was inspected
- Search prior findings through `.agents/agents knowledge` before broad repo rereads when relevant
- Prefer `.agents/agents knowledge pull "<topic>"` before opening full historical docs so the first pass stays compact
- Final session closure requires a finalized postmortem

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

### Docs Boundary Rule

- `docs/` is documentation-only
- Do not use it for runtime state, caches, mirrors, generated artifacts, or operational data
- Operational state must live outside `docs/` (for example: `.agents/cache/`, `.agents/wb/`)

### Project vs Agent Boundary

- Reserve `.agents/` for agent-system surfaces such as workbench state, rules,
  skills, telemetry, and runtime automation.
- Keep project-owned documentation under `docs/` at the repository root.
- Use `docs/map/` for current-state repository maps, architecture snapshots,
  APIs, ABIs, hooks, frontend and backend structure, and analysis evidence.
- Keep workbench sessions and other agent runtime state under `.agents/`.

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

## Project-Local Skills Preferred

- Prefer project-local skills under `.agents/skills/` as the main skill surface for interactive runtimes in this repo.
- Keep global Codex skills lean; do not depend on a large machine-global skill set as the primary project behavior source.
- Prefer a repo-local universal-skills source checkout at `.agents/source/universal-skills`.
- Bootstrap should seed `.agents/source/universal-skills` from committed repo assets by default, so downstream installs stay local-first.
- Treat `skills-sync sync` / `skills-sync update` as the simple path that refreshes `.agents/skills/` from the configured universal-skills git source.
- Treat `skills-sync pull` as a source-refresh step only for an external universal-skills checkout, and keep `skills-sync push` disabled unless a controlled maintenance session explicitly enables publishing.
