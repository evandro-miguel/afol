---
doc_type: plan
id: 260306_2240_session-close-command_plan_01
theme: session-close-command
status: final
owners:
- orchestrator
created_at: '2026-03-06T22:40:43-03:00'
updated_at: '2026-03-07T18:41:21-03:00'
roadmap_feature: F-08
parent_spec: 260306_context-driven-execution-commands_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  brainstorm: 260306_2240_session-close-command_brainstorm_01
  explorer_check: 260306_2240_session-close-command_explorer-check_01
  research: 260306_2240_session-close-command_research_01
  task: 260306_2240_session-close-command_task_01
repo: agentic_start_folder
branch: main
---

# Plan: session-close-command

## Objective
- Deliver work for roadmap feature `F-08` within the boundaries defined by parent spec `260306_context-driven-execution-commands_spec_01`.

## Scope
- In scope:
  - Add a top-level `session close` command
  - Gate closure on `verify-tasks --strict`
  - Support optional `.active_session` repointing via `--next-session`
  - Update command references and tool catalog
  - Add focused unit coverage
- Out of scope:
  - Changing what counts as a valid closed session
  - Auto-finalizing reports/postmortems/tasks
  - Archiving or deleting sessions

## Governance Context
- Roadmap feature: `F-08`
- Parent spec: `260306_context-driven-execution-commands_spec_01`
- Child spec: ``
- Planning rule:
  - Do not redefine feature philosophy here; use this file to plan execution of already-defined intent.
  - A major plan is not complete until brainstorm and explorer-check artifacts exist and are linked here.

## Planning Inputs
- Brainstorm artifact: `260306_2240_session-close-command_brainstorm_01`
- Explorer check artifact: `260306_2240_session-close-command_explorer-check_01`
- Research artifact: `260306_2240_session-close-command_research_01`
- Knowledge lookup performed:
  - Reused the F-08 execution-command test surface and workflow guidance from `agentic-system-workflow`

## Success Criteria
- `.agents/agents session close` exists and works for active or explicit sessions
- Closure fails when strict verification fails
- `--next-session` safely repoints `.active_session`
- `make lint`, `make lint-scripts`, `make test-scripts`, and command smoke checks pass

## Delivery Strategy
1. Implement `agents-session.py` and wire it into the wrapper
2. Add tests and update operator-facing docs/catalog entries
3. Run validation, finalize the workbench session, and close it with the new command

## Critical Dependencies
- Tools:
  - `verify-tasks.py`
  - `agents-wb-update.py`
- MCPs:
  - none
- Skills:
  - `agentic-system-workflow`
- Executor instruction:
  - Research whether additional critical dependencies are needed before execution.

## Large Plan Handling
- If this plan exceeds 500 lines, split into phases.
- Create one task file per phase.

## Risks and Mitigations
- Risk: Pointer semantics become ambiguous -> Mitigation: keep default behavior non-destructive and expose explicit `--next-session`
- Risk: Closure command drifts from real verification -> Mitigation: delegate closure eligibility to `verify-tasks --strict`

## Verification Plan
- Unit: `make test-scripts`
- E2E: `./.agents/agents session close --session <completed-session>`
- Typecheck: `python3 -m py_compile .agents/scripts/agents-session.py`
- Lint: `make lint` and `make lint-scripts`
- Other checks:
  - `./.agents/agents status --json` -> confirm session summary stays coherent
  - `make all` -> prove the repo-level validation path still passes

## Completion Gate
- [x] Brainstorm exists and reflects real option analysis
- [x] Explorer check proves current-project inspection happened
- [x] Relevant prior knowledge was searched or explicitly ruled out
- [x] Verification path is concrete enough to execute without guesswork

---
*Template: `.agents/a-docs/templates/plan.md`*
