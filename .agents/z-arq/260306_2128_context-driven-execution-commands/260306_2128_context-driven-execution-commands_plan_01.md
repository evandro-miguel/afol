---
doc_type: plan
id: 260306_2128_context-driven-execution-commands_plan_01
theme: context-driven-execution-commands
status: active
owners:
- orchestrator
created_at: '2026-03-06T21:28:26-03:00'
updated_at: '2026-03-06T22:34:26-03:00'
roadmap_feature: F-08
parent_spec: 260306_context-driven-execution-commands_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  brainstorm: 260306_2128_context-driven-execution-commands_brainstorm_01
  explorer_check: 260306_2128_context-driven-execution-commands_explorer-check_01
  research: ''
  task: 260306_2128_context-driven-execution-commands_task_01
repo: agentic_start_folder
branch: ''
---

# Plan: context-driven-execution-commands

## Objective
- Deliver a governed implementation plan for roadmap feature `F-08` within the boundaries defined by parent spec `260306_context-driven-execution-commands_spec_01`.

## Scope
- In scope:
  - define the phased adoption model for the best Conductor ideas that fit the scaffold
  - sequence the command families and their prerequisites
  - identify which child specs should exist before implementation starts
- Out of scope:
  - shipping the new command implementations in this planning workstream
  - importing Conductor's track directory or git-notes workflow

## Governance Context
- Roadmap feature: `F-08`
- Parent spec: `260306_context-driven-execution-commands_spec_01`
- Child spec: ``
- Planning rule:
  - Do not redefine feature philosophy here; use this file to plan execution of already-defined intent.
  - A major plan is not complete until brainstorm and explorer-check artifacts exist and are linked here.

## Planning Inputs
- Brainstorm artifact: `260306_2128_context-driven-execution-commands_brainstorm_01`
- Explorer check artifact: `260306_2128_context-driven-execution-commands_explorer-check_01`
- Research artifact: ``
- Knowledge lookup performed:
  - `./.agents/agents knowledge pull runtime` surfaced the F-06 runtime compatibility work as directly reusable input.
  - Local repo inspection confirmed the current strengths are governance, workbench evidence, knowledge reuse, and runtime parity.
  - Upstream Conductor inspection confirmed the most transferable capabilities are artifact resolution and command flow design.

## Success Criteria
- A roadmap feature and parent spec exist for context-driven execution commands.
- The feature is decomposed into implementation phases that preserve the current `.agents` architecture.
- The backlog makes clear what should be built first, what should not be imported, and which runtime concerns must remain adapter-thin.

## Delivery Strategy
1. Phase 1: Foundation
   - Define the child-spec set and artifact-resolution contract.
   - Decide the canonical location and structure for project-context documents.
2. Phase 2: Operator entry flows
   - Implement setup/resume semantics for project context.
   - Implement `status` as the low-risk command that proves artifact resolution and next-step discovery.
3. Phase 3: Guided execution
   - Implement `implement` on top of approved plan/task/workflow artifacts.
   - Ensure evidence, task-state changes, and report updates reuse current workbench tooling.
4. Phase 4: Governed review and rollback
   - Implement `review` against plan, spec, workflow, and guidelines.
   - Implement `revert` for task, phase, pack, or session with git as supporting evidence.
5. Phase 5: Runtime parity and adoption
   - Reflect command semantics in runtime mirrors and adapters.
   - Add docs, examples, and enforcement checks needed to keep behavior aligned.

## Critical Dependencies
- Tools:
  - `.agents/agents`
  - `.agents/scripts/agents-wb-update.py`
  - `.agents/scripts/agents-knowledge.py`
  - future artifact-resolution helper library under `.agents/scripts/lib/`
- MCPs:
  - none required
- Skills:
  - `agentic-system-workflow`
- Executor instruction:
  - Research whether additional critical dependencies are needed before execution.

## Large Plan Handling
- If this plan exceeds 500 lines, split into phases.
- Create one task file per phase if implementation fan-out becomes too large for a single board.

## Risks and Mitigations
- Risk: the feature drifts into a second governance system -> Mitigation: keep roadmap, parent spec, workbench, and runtime mirrors canonical.
- Risk: `implement` grows too complex before foundations exist -> Mitigation: force artifact resolution and `status` first.
- Risk: `revert` over-relies on git history -> Mitigation: treat git as evidence and sync workbench state explicitly.
- Risk: runtime adapters diverge -> Mitigation: plan runtime parity as a dedicated final phase instead of an afterthought.

## Verification Plan
- Unit: targeted tests for artifact-resolution helpers and command parsing once implementation starts
- E2E: command smoke tests for `status`, `implement`, `review`, and `revert` in a fixture repo once implementation starts
- Typecheck: N/A today
- Lint: `make lint`
- Other checks:
  - docs parity check between `AGENTS.md` and runtime mirrors once command semantics are documented
  - workbench evidence check proving new commands update task/log/report artifacts instead of parallel state

## Completion Gate
- [x] Brainstorm exists and reflects real option analysis
- [x] Explorer check proves current-project inspection happened
- [x] Relevant prior knowledge was searched or explicitly ruled out
- [x] Verification path is concrete enough to execute without guesswork
