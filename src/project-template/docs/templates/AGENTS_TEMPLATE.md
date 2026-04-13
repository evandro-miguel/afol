---
doc_type: standard
id: agents-template-01
created_at: YYYY-MM-DDTHH:MM:SSZ
updated_at: '2026-04-13T13:36:52-03:00'
status: draft
---

# AGENTS.md template

## Project Overview

`{project_name}` is a project that uses a local `.agents` workflow layer for LLM-assisted development. Replace this paragraph with the project's actual purpose, users, and delivery constraints after bootstrap.

## Current Stack

- **Languages:** <project languages>
- **Runtime/CLI:** <project runtime, command entrypoints, and agent adapter notes>
- **Package/tool manager:** <package manager and task runner>
- **Data/config formats:** <data and config formats used by this project>

## Runtime Positioning

- The `.agents` layer is optimized for interactive agent execution inside CLI tools, not for embedding a standalone agent SDK into an application backend.
- Runtime folders and adapter files should stay thin, secret-free, and focused on interactive execution compatibility.
- Prefer governance, tooling, and docs changes that improve interactive terminal workflows.

## Working Principles

### Global Objective

- Contribute to a correct, minimal, tested, well-evidenced, and context-efficient delivery.
- Optimize for truth over fluency, evidence over guesswork, reuse over reinvention, minimal delta over broad changes, focused context over broad context, and executable validation over model opinion.

### Non-Negotiables

- Do not fabricate facts, code behavior, file contents, test results, tool outputs, source quality, or repository state.
- Do not silently assume unclear requirements when the ambiguity materially affects correctness, architecture, scope, contracts, security, or data.
- Do not create speculative features.
- Do not expand scope silently.
- Do not mark work as done without evidence.
- Do not consume large amounts of context unless clearly necessary.
- Do not perform unrelated repo-wide cleanup.

### Context Discipline

- Start narrow.
- Read, search, and inspect only what is needed for the current task.
- Prefer symbol search, grep, index search, file tree checks, and targeted reads before broad reads.
- Before opening more files or sources, summarize what is already known in 3 to 7 lines.
- Stop gathering context when additional context is unlikely to change the decision.
- Pass compressed handoffs, not raw dumps.
- Prefer structured summaries over long prose.

### Evidence Rules

- Prefer deterministic evidence over model judgment whenever possible.
- Evidence priority: reproducible tests or deterministic repro; lint, typecheck, build, schema checks, static checks; focused runtime validation; visual or observable confirmation; model critique.
- Use model critique to find problems and improvement opportunities.
- Do not use model critique as final proof when executable checks are available.

### Testing and Quality

- Strong default target: at least 80% of touched logic should be covered by meaningful tests or equivalent high-confidence validation when practical and measurable.
- Coverage is not a substitute for meaningful assertions.
- Always look for existing tests before writing new ones.
- Prefer focused tests close to the changed behavior.
- If tests cannot be added or run, explain exactly why and provide the strongest substitute validation available.
- Leave the touched scope cleaner, more coherent, and easier to verify than before.

### Reuse and Minimality

- First search for an existing pattern, helper, module, test, or documentation that can be reused.
- Prefer deletion, simplification, consolidation, or reuse before adding new code.
- Prefer the smallest correct change that satisfies the requirement.
- If a task is too broad, reduce it to the smallest executable slice and state the remaining slices clearly.

### Cleanliness

- Clean what you touch.
- Remove orphaned imports, dead branches, duplicated snippets introduced by the current work, stale comments caused by the change, and local inconsistencies in the touched scope.
- Do not perform unrelated cleanup unless it blocks correctness, validation, or safe delivery.

### Escalation

- After 2 failed attempts on the same issue, change strategy.
- After 3 materially different strategies without meaningful progress, escalate.
- Escalate early if the blocker is caused by missing access, contradictory requirements, broken tooling, external dependency failure, or systemic ambiguity.
- Escalation must be concise and structured: current objective, observed evidence, strategies attempted, suspected root cause, minimum next action needed.

### Communication

- Be concise.
- Lead with the answer, finding, or verdict.
- Separate facts, inferences, risks, and unknowns.
- Prefer compact structured output.
- Avoid long narrative unless it adds decision value.

## Repo Structure

- `docs/`: project-owned documentation, including repository maps, standards, templates, telemetry docs, and other non-agent project docs
- `.agents/scripts/`: core agent CLI tools and helpers (automation, sync, verification, telemetry)
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

- For major work, the workbench plan file is an ExecPlan and must follow `docs/templates/plan.md` plus `.agents/rules/RULE-002-workstream-creation.md`
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
- Treat `skills-sync pull` as a source-refresh step only for an external universal-skills checkout, and use `skills-sync push` only as a branch/PR proposal flow that never pushes directly to universal `main`.
