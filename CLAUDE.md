# Agent-specific instructions for CLAUDE
# Auto-synced from AGENTS.md - run `.agents/scripts/sync-agent-docs.py` to update

# AGENTS.md

## Project Overview

This repository is a base scaffold for an `AGENTS`-based workflow system used to coordinate LLM-assisted development. It provides standardized tooling for creating workstreams, tracking tasks, validating docs, and collecting telemetry across projects.

## Current Stack

- **Main language:** Python 3.11+
- **Runtime and tooling:** Python scripts (`.agents/scripts/*`), Bash wrappers, Make, shell-based automation
- **Package manager:** `uv` (for Python environment/dependency management)
- **Docs/data formats:** Markdown, YAML, JSON, TOML

## Repo Structure

- `.agents/scripts/`: implementation of CLI commands (telemetry, patterns, linting, workbench updates)
- `.agents/a-docs/`: documentation standards, templates, patterns, rules, telemetry documentation
- `.agents/wb/`: workbench sessions (plan/task/log/report/research/spec/...) and active session state
- `.agents/rules/`: operational guardrail files
- `.agents/data/`: telemetry data and JSON schemas
- `.agents/skills/`: project skills and workflows
- `.agents/cache/`: cached remote skill/tool metadata
- `.agents/templates/`: local documentation templates and reusable agent instructions
- `.agents/agents.config`: configuration for wrappers, sync, and runtime defaults
- `.opencode/`: OpenCode-specific project adapter folder
- `opencode.json`: committed OpenCode project configuration entrypoint (must remain secret-free)
- `README.md`: onboarding and command reference for the scaffold

## Important Files

- `.agents/agents` (CLI entrypoint)
- `.agents/scripts/agents-*.py` (command implementations)
- `.agents/a-docs/templates/` (doc/workbench templates)
- `.agents/wb/` and `.agents/z-arq/` (active and archived workstreams)
- `Makefile` (delegates to `.agents/a-docs/standards/Makefile`)
- `.agents/agents.config` (source/target config for sync and runtime)

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
- Mandatory gate: `make lint` must pass before any task/session can be marked as complete
- Ask: `Would this pass a strict senior/staff review?`
- Deterministic verification: evidence over assumptions

### Documentation Currency (Mandatory)

- Every non-trivial change must have corresponding management documentation in the active workbench session.
- Major code/docs changes must include at least:
  - one updated plan/task/log entry
  - one report artifact with validation evidence
  - one knowledge/learned entry if a correction, bug, or process gap was found
- Any tool/command change must have its canonical command reference updated in:
  - `README.md`
  - `.agents/a-docs/standards/`
  - runtime mirrors when behavior/usage changed
- Do not finish a workstream without explicitly checking the documentation freshness requirement in the final report.

### Roadmap-First Delivery (Mandatory)

- Every meaningful feature must exist in `.agents/arc/GENERAL-ROADMAP.md`
- Every roadmap feature must link to one governing parent spec in `.agents/arc/SPECS/`
- Use child specs when they improve clarity, coordination, or reviewability for a feature
- Workstreams must carry `roadmap_feature` and `parent_spec` context
- Specs define philosophy, expected behavior, user journey, boundaries, and acceptance
- Local workstreams may choose `spec` or `spec-lite` as needed; the parent spec remains mandatory
- Workstreams define delivery and verification; they do not replace strategic feature definition

### Planning Intelligence (Mandatory For Major Work)

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
- Identify root cause first, not only symptoms
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
- Do not use `.agents/a-docs/` for runtime state, caches, mirrors, or generated artifacts
- Operational state must live outside `.agents/a-docs/` (for example: `.agents/cache/`, `.agents/wb/`, `.agents/tmp/`)

### Temporary Workspace Rule

- Use `.agents/tmp/` for temporary files that do not fit the durable structure yet
- Treat `.agents/tmp/` as non-canonical and disposable
- Do not store final docs, decisions, roadmap items, or session evidence in `.agents/tmp/`

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

### Agent Sync

- `AGENTS.md` is the source for `OPENCODE.md`, `QWEN.md`, `CLAUDE.md`, and `GEMINI.md`
- Keep generic operating guidance in sync here and add repository-specific detail in this file

### Primary Runtime Compatibility

- Treat OpenCode, Codex, and Qwen as the primary supported runtimes for this scaffold
- Keep `AGENTS.md` and `.agents/*` as the canonical governance layer across all runtimes
- Keep committed runtime adapters thin, secret-free, and traceable back to canonical governance
- Never commit runtime credentials, auth state, or user-local machine configuration

---

> **⚠️ IMPORTANT:** THIS FILE IS A REPLICA OF THE `AGENTS.md`.
>
> - **DO NOT READ** the `AGENTS.md` AGAIN if you read this one.
> - The official skills and files of the repo are always on `.agents/skills`.
> - This file is auto-synced. Run `.agents/scripts/sync-agent-docs.py` to update.
