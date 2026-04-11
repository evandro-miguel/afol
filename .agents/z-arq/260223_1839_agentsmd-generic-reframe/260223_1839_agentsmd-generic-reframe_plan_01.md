---
doc_type: plan
id: 260223_1839_agentsmd-generic-reframe_plan_01
theme: agentsmd-generic-reframe
status: final
owners:
- orchestrator
created_at: '2026-02-23T15:39:42-03:00'
updated_at: '2026-02-23T16:12:49-03:00'
repo: agentic_start_folder
branch: main
links:
  spec: 260223_1839_agentsmd-generic-reframe_spec-lite_01
  task: 260223_1839_agentsmd-generic-reframe_task_01
---

# Plan: agentsmd-generic-reframe

## Objective
- Reframe root `AGENTS.md` to a generic reusable project contract while reflecting the current repository state.

## Scope
- In scope:
  - Rewrite `AGENTS.md` with the requested canonical sections.
  - Fill sections with current repo information (stack, structure, key files, commands, skills, MCPs).
  - Keep workbench/process rules aligned with `.agents` standards.
- Out of scope:
  - Large refactors in scripts or standards content outside AGENTS alignment.

## Success Criteria
- `AGENTS.md` matches requested generic-first structure.
- `make sync` propagates AGENTS changes to agent files.
- `make lint` and `make verify` pass after updates.

## Delivery Strategy
1. Gather current repo facts and requested layout.
2. Rewrite root `AGENTS.md`.
3. Sync agent docs and verify workflow commands.

## Critical Dependencies
- Tools:
  - `make`
  - `.agents/agents`
- MCPs:
  - None required for implementation
- Skills:
  - `workbench-agent-teams` (guideline reference)
- Executor instruction:
  - Prefer minimal diffs and keep root contract generic-first.

## Large Plan Handling
- If this plan exceeds 500 lines, split into phases.
- Create one task file per phase.

## Risks and Mitigations
- Risk: Over-specializing AGENTS to this repo -> Mitigation: keep explicit reusable section scaffold and concise repo-specific fills.

## Verification Plan
- Unit: `N/A`
- E2E: `N/A`
- Typecheck: `N/A`
- Lint: `make lint`
- Other checks:
  - `make sync` to ensure agent docs are aligned.
  - `make verify` to ensure workbench task closure.

---
*Template: `.agents/a-docs/templates/plan.md`*
