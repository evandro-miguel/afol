---
doc_type: plan
id: 260306_1937_primary-runtime-compatibility_plan_01
theme: primary-runtime-compatibility
status: final
owners:
- orchestrator
created_at: '2026-03-06T19:37:14-03:00'
updated_at: '2026-03-06T19:49:56-03:00'
roadmap_feature: F-06
parent_spec: 260306_primary-agent-runtime-compatibility_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  task: 260306_1937_primary-runtime-compatibility_task_01
repo: agentic_start_folder
branch: main
---

# Plan: primary-runtime-compatibility

## Objective
- Deliver work for roadmap feature `F-06` within the boundaries defined by parent spec `260306_primary-agent-runtime-compatibility_spec_01`.

## Scope
- In scope:
  - Research official runtime capabilities and constraints for OpenCode, Codex, and Qwen.
  - Add first-class OpenCode support to committed repo structure, bootstrap, and sync flows.
  - Define the compatibility contract for committed runtime-facing files versus local-only files.
- Out of scope:
  - Provider credentials, runtime auth tokens, and user-local machine setup.
  - Full normalization of every runtime-specific config surface.

## Governance Context
- Roadmap feature: `F-06`
- Parent spec: `260306_primary-agent-runtime-compatibility_spec_01`
- Child spec: ``
- Planning rule:
  - Do not redefine feature philosophy here; use this file to plan execution of already-defined intent.

## Success Criteria
- OpenCode is represented as a primary runtime in bootstrap and sync.
- The repo ships a documented compatibility contract for OpenCode, Codex, and Qwen.
- Runtime-facing committed files remain secret-free and point back to canonical governance.

## Delivery Strategy
1. Research official runtime behavior and identify repo-safe adapter patterns.
2. Update runtime-facing scaffold files, sync, bootstrap, and standards around the compatibility contract.
3. Verify the new runtime support and record the research findings in workstream docs.

## Critical Dependencies
- Tools:
  - `.agents/agents sync`
  - `make lint`
  - `make test-scripts`
  - `make doctor`
  - `make all`
- MCPs:
  - <critical only>
- Skills:
  - `agentic-system-workflow`
- Executor instruction:
  - Use official vendor/runtime documentation as the primary source for compatibility guidance.

## Large Plan Handling
- If this plan exceeds 500 lines, split into phases.
- Create one task file per phase.

## Risks and Mitigations
- Risk: OpenCode support becomes a forked parallel system -> Mitigation: keep `AGENTS.md` canonical and runtime adapters thin.
- Risk: Runtime-specific docs encourage committing secrets -> Mitigation: document a strict committed-versus-local boundary.
- Risk: Compatibility guidance drifts from real runtimes -> Mitigation: base the contract on official runtime documentation and keep the adapter layer narrow.

## Verification Plan
- Unit: <command or N/A>
- Unit: `make test-scripts`
- E2E: <command or N/A>
- E2E: `N/A`
- Typecheck: <command or N/A>
- Typecheck: `N/A`
- Lint: <command or N/A>
- Lint: `make lint`
- Other checks:
  - `make doctor`
  - `make all`
  - confirm `OPENCODE.md` is generated from `AGENTS.md`

---
*Template: `.agents/a-docs/templates/plan.md`*
