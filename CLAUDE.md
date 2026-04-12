# Agent-specific instructions for CLAUDE
# Auto-synced from AGENTS.md - run `.agents/scripts/sync-agent-docs.py` to update

# AGENTS.md

## Project Overview

This repository is a base scaffold for an `AGENTS`-based workflow system used to coordinate LLM-assisted development. It is designed for interactive agent runtimes that operate through CLI products such as Codex CLI, OpenCode, Gemini CLI, Claude Code, and similar terminal-first agents. It provides standardized tooling for creating workstreams, tracking tasks, validating docs, and collecting telemetry across projects.

## Current Stack

- **Main language:** Python 3.11+
- **Runtime and tooling:** Python scripts (`.agents/scripts/*`), Bash wrappers, Make, shell-based automation, runtime adapter docs for interactive agent CLIs
- **Package manager:** `uv` (for Python environment/dependency management)
- **Docs/data formats:** Markdown, YAML, JSON, TOML

## Runtime Positioning

- This scaffold is for interactive agent execution environments, not for embedding a general-purpose agent SDK into an application runtime.
- The primary execution model is: an operator opens a repository in an interactive CLI agent, and the scaffold provides the governance, docs, tools, telemetry, and runtime adapters that the agent uses while working.
- Runtime folders such as `.opencode/`, `.codex/`, `.qwen/`, `.claude/`, and `.gemini/` should stay thin and focused on adapter/configuration concerns for those interactive CLIs.
- Do not redesign the scaffold around long-lived backend agent services unless the roadmap explicitly introduces that use case.

## Repo Structure

- `docs/`: project-owned documentation, repository mapping, and other non-agent project docs
- `.agents/scripts/`: implementation of CLI commands (telemetry, patterns, linting, workbench updates)
- `.agents/wb/`: workbench sessions (plan/task/log/report/research/spec/...) and active session state
- `.agents/rules/`: operational guardrail files
- `.agents/data/`: telemetry data and JSON schemas
- `.agents/skills/`: project skills and workflows
- `.agents/cache/`: cached remote skill/tool metadata
- `.agents/agents.config`: configuration for wrappers, sync, and runtime defaults
- `.opencode/`: OpenCode-specific project adapter folder
- `opencode.json`: committed OpenCode project configuration entrypoint (must remain secret-free)
- `README.md`: onboarding and command reference for the scaffold

## Important Files

- `docs/map/` (current-state repository maps and analysis evidence)
- `.agents/agents` (CLI entrypoint)
- `.agents/scripts/agents-*.py` (command implementations)
- `docs/templates/` (doc/workbench templates)
- `.agents/wb/` and `.agents/z-arq/` (active and archived workstreams)
- `Makefile` (delegates to `docs/standards/Makefile`)
- `.agents/agents.config` (source/target config for sync and runtime)

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
  - `docs/standards/`
  - runtime mirrors when behavior/usage changed
- Do not finish a workstream without explicitly checking the documentation freshness requirement in the final report.

### Roadmap-First Delivery (Mandatory)

- Every meaningful feature must exist in `docs/arc/GENERAL-ROADMAP.md`
- Every roadmap feature must link to one governing parent spec in `docs/arc/SPECS/`
- Use child specs when they improve clarity, coordination, or reviewability for a feature
- Workstreams must carry `roadmap_feature` and `parent_spec` context
- Specs define philosophy, expected behavior, user journey, boundaries, and acceptance
- Local workstreams may choose `spec` or `spec-child`; keep `spec-lite` as a legacy alias during migration. The parent spec remains mandatory.
- Workstreams define delivery and verification; they do not replace strategic feature definition

### Planning Intelligence (Mandatory For Major Work)

- For major work, the workbench plan file is an ExecPlan and must follow `PLANS.md`
- The canonical ExecPlan path is `.agents/wb/<session_id>/<session_id>_plan_01.md`
- ExecPlans must stay self-contained and living: keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current while work proceeds
- Major plans must link to a brainstorm artifact before the plan can be considered complete
- Major plans must link to an explorer-check artifact proving the current repo was inspected
- Search prior findings through `.agents/agents knowledge` before broad repo rereads when relevant
- Prefer `.agents/agents knowledge pull "<topic>"` before opening full historical docs so the first pass stays compact
- If external memory integration is enabled, use `.agents/agents memory search|context "<topic>"` after repo-local `knowledge` lookup when cross-project context is still needed
- Treat external memory as auxiliary retrieval only; never replace `.agents/wb/` or repo-local `knowledge` as canonical project state
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

### Docs Boundary Rule

- `docs/` is the project-owned documentation surface
- Do not use `docs/` for runtime state, caches, mirrors, or generated operational artifacts
- Operational state must live outside `docs/` (for example: `.agents/cache/`, `.agents/wb/`, `.agents/tmp/`)

### Project vs Agent Boundary

- Reserve `.agents/` for agent-system surfaces such as workbench state, rules,
  skills, telemetry, and runtime automation.
- Keep project-owned documentation under `docs/` at the repository root when
  the documentation is about the repository rather than the agent system.
- **`docs/map/` is the current-state, descriptive, non-governance surface.**
  It holds repository maps, codemaps, dependency graphs, API/ABI snapshots,
  and analysis evidence generated from tooling. It describes what the repo
  looks like right now, not what it should become.
- **`docs/map/` must never contain:** roadmap entries, feature specs, ADRs,
  project briefs, architecture intent, or any document that defines desired
  behavior or product philosophy. Those belong under `docs/arc/`.
- **`docs/arc/` is the goal-state, prescriptive, governance surface.**
  It holds roadmap, specs, decisions, architecture, project brief, tech stack,
  and engineering guidelines. It defines what the repo should become.
- Use `docs/arc/`, `docs/standards/`, `docs/templates/`, `docs/telemetry/`,
  `docs/patterns/`, `docs/knowledge/`, and `docs/lessons/` for project-facing
  canon that should live with the repository instead of the agent runtime.
- Workbench sessions, runtime rules, and agent memory remain under `.agents/`.
- Workstreams may reference `docs/map/` as evidence of current state, but must
  never promote map artifacts to governance sources. When map evidence conflicts
  with roadmap/spec intent, the roadmap/spec wins.

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

- Treat OpenCode, Codex, Qwen, Gemini CLI, and Claude Code style interactive runtimes as the primary supported environments for this scaffold
- Keep `AGENTS.md` and `.agents/*` as the canonical governance layer across all runtimes
- Keep committed runtime adapters thin, secret-free, and traceable back to canonical governance
- Never commit runtime credentials, auth state, or user-local machine configuration
- Prefer changes that improve terminal-first interactive execution over changes that only benefit embedded SDK/server scenarios

### Project-Local Skills Preferred

- Prefer project-local skills under `.agents/skills/` as the main skill surface for Codex, OpenCode, Qwen, Claude Code, and Gemini CLI in this repo.
- Keep global Codex skills lean; do not rely on a large machine-global skill set as the primary source of project behavior.
- Prefer a repo-local universal-skills source seed at `.agents/source/universal-skills`; it must not be a nested git checkout.
- Do not create or use `.agents/cache/universal-skills`; Git-backed universal-skills work must happen in an external checkout configured via `AGENTS_UNIVERSAL_SKILLS_SOURCE` or `skills_sync.external_source_dir`.
- Bootstrap and `skills-sync` should prepare the project-local skill surface so each repository carries only the subset it actually needs.
- Treat `skills-sync sync` / `skills-sync update` as the simple path that refreshes `.agents/skills/` from the configured universal-skills source.
- Treat `skills-sync pull` as a refresh step only for an external git checkout; `skills-sync push` is only a branch/PR proposal flow and must never push directly to universal `main`.

### Optional External Memory

- The scaffold may expose an optional `memory` adapter for external memory providers such as `basic_memory`.
- Use `.agents/agents memory status` to inspect the configured provider/project/runtime contract.
- Use `.agents/agents memory search|context|recent|show` to emit exact MCP contracts for interactive runtimes when cross-project context is needed.
- The `memory` command family is contract-only in the scaffold. It governs how agents should call memory MCP tools through the host runtime; it does not execute MCP tool calls from shell.
- Keep repo-local workbench docs and `knowledge` canonical. External memory is for auxiliary retrieval and curated reuse, not for live task/plan/report authority.

---

> **⚠️ IMPORTANT:** THIS FILE IS A REPLICA OF THE `AGENTS.md`.
>
> - **DO NOT READ** the `AGENTS.md` AGAIN if you read this one.
> - The official skills and files of the repo are always on `.agents/skills`.
> - This file is auto-synced. Run `.agents/scripts/sync-agent-docs.py` to update.
