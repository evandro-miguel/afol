---
doc_type: plan
id: 260223_1847_agentsmd-template-placeholders_plan_01
theme: agentsmd-template-placeholders
status: draft
owners:
- orchestrator
created_at: '2026-02-23T15:47:41-03:00'
updated_at: '2026-02-23T16:12:49-03:00'
repo: agentic_start_folder
branch: main
links:
  spec: 260223_1847_agentsmd-template-placeholders_spec-lite_01
  task: 260223_1847_agentsmd-template-placeholders_task_01
---

# Plan: agentsmd-template-placeholders

## Objective
- Convert root `AGENTS.md` into a pure generic template with placeholders only.

## Scope
- In scope:
  - Remove repo-specific filled values from AGENTS sections.
  - Keep only template placeholders for tools, MCPs, skills, stack, and structure.
  - Keep requested section order and wording generic.
- Out of scope:
  - Changes in operational scripts behavior.
  - Broader documentation refactors outside AGENTS and workstream docs.

## Success Criteria
- `AGENTS.md` contains placeholders instead of concrete stack/tools/MCP/skills values.
- `make sync` propagates template to `QWEN.md`, `CLAUDE.md`, and `GEMINI.md`.
- `make lint` and `make verify` pass.

## Delivery Strategy
1. Rewrite AGENTS as a template-only document.
2. Sync replicated agent docs.
3. Validate and document evidence.

## Critical Dependencies
- Tools:
  - `make`
- MCPs:
  - None required
- Skills:
  - None required
- Executor instruction:
  - Keep wording generic and avoid filling operational placeholders.

## Large Plan Handling
- If this plan exceeds 500 lines, split into phases.
- Create one task file per phase.

## Risks and Mitigations
- Risk: accidentally reintroducing repo-specific values -> Mitigation: explicit placeholder blocks in all variable sections.

## Verification Plan
- Unit: `N/A`
- E2E: `N/A`
- Typecheck: `N/A`
- Lint: `make lint`
- Other checks:
  - `make sync`
  - `make verify`

---
*Template: `.agents/a-docs/templates/plan.md`*
