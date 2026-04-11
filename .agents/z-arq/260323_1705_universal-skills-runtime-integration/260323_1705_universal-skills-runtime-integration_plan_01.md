---
doc_type: plan
id: 260323_1705_universal-skills-runtime-integration_plan_01
theme: universal-skills-runtime-integration
status: final
owners:
- orchestrator
created_at: '2026-03-23T17:05:28-03:00'
updated_at: '2026-03-23T17:25:44-03:00'
roadmap_feature: F-10
parent_spec: 260323_1704_universal-skills-runtime-integration_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  brainstorm: 260323_1705_universal-skills-runtime-integration_brainstorm_01
  explorer_check: 260323_1705_universal-skills-runtime-integration_explorer-check_01
  research: 260323_1705_universal-skills-runtime-integration_research_01
  task: 260323_1705_universal-skills-runtime-integration_task_01
repo: agentic_start_folder
branch: main
---

# Plan: universal-skills-runtime-integration

## Objective
- Deliver work for roadmap feature `F-10` within the boundaries defined by parent spec `260323_1704_universal-skills-runtime-integration_spec_01`.

## Scope
- In scope:
  - Define the scaffold-local integration plan for upstream universal-skills semantics.
  - Upgrade `skills-sync` toward repo/ref/profile-aware behavior.
  - Integrate the new skills model into bootstrap and docs.
  - Add tests and verification commands for the migration.
- Out of scope:
  - Replacing the upstream universal-skills repository.
  - Importing every upstream helper command in the first pass.
  - Reworking unrelated runtime adapters.

## Governance Context
- Roadmap feature: `F-10`
- Parent spec: `260323_1704_universal-skills-runtime-integration_spec_01`
- Child spec: ``
- Planning rule:
  - Do not redefine feature philosophy here; use this file to plan execution of already-defined intent.
  - A major plan is not complete until brainstorm and explorer-check artifacts exist and are linked here.

## Planning Inputs
- Brainstorm artifact: `260323_1705_universal-skills-runtime-integration_brainstorm_01`
- Explorer check artifact: `260323_1705_universal-skills-runtime-integration_explorer-check_01`
- Research artifact: `260323_1705_universal-skills-runtime-integration_research_01`
- Knowledge lookup performed:
  - `./.agents/agents knowledge pull "skills sync bootstrap runtime compatibility"` -> no directly reusable compact digest; used local repo exploration plus upstream universal-skills source docs.

## Success Criteria
- The scaffold defines a concrete migration from the current simple skills manifest to a stronger universal-skills-compatible contract.
- `skills-sync` execution has a bounded first implementation slice with clear file ownership and verification commands.
- Bootstrap integration is explicitly planned for both fresh and partial install paths.
- Execution is split into parallelizable tasks that can be delegated safely.

## Delivery Strategy
1. Redesign the local skills contract and `skills-sync` command surface around upstream repo/ref/profile semantics.
2. Integrate the new contract into bootstrap, config, and docs while preserving current scaffold UX.
3. Add tests, validation paths, and migration notes for downstream repos.

## Critical Dependencies
- Tools:
  - `./.agents/agents skills-sync`
  - `./.agents/agents bootstrap`
  - `make skills-check`
  - `make test-scripts`
- MCPs:
  - none
- Skills:
  - `projects-workflow`
  - `docs-operations`
- Executor instruction:
  - Keep runtime positioning CLI-interactive-first and avoid drifting into generic SDK/runtime architecture.

## Large Plan Handling
- If this plan exceeds 500 lines, split into phases.
- Create one task file per phase.

## Risks and Mitigations
- Risk: migrate too much upstream policy at once -> Mitigation: keep phase one to the minimum contract needed for pinned source/profile/runtime installs.
- Risk: bootstrap and current users break during migration -> Mitigation: preserve a migration path from the current manifest and verify fresh + partial installs.
- Risk: scaffold duplicates universal-skills logic badly -> Mitigation: keep scaffold commands as adapters over upstream concepts, not a second divergent system.

## Verification Plan
- Unit: `./.agents/scripts/.venv/bin/pytest .agents/scripts/tests/test_agents_skills_sync.py -q`
- E2E: `./.agents/agents bootstrap <tmpdir>` and `./.agents/agents bootstrap <tmpdir> --partial` plus target `skills-check`
- Typecheck: `N/A`
- Lint: `make lint && make lint-scripts`
- Other checks:
  - `make test-scripts` -> prove the full script suite still passes
  - `make doctor` -> prove scaffold structure/runtime docs remain valid
  - `./.agents/agents skills-sync status` -> prove manifest/config semantics are coherent

## Completion Gate
- [x] Brainstorm exists and reflects real option analysis
- [x] Explorer check proves current-project inspection happened
- [x] Relevant prior knowledge was searched or explicitly ruled out
- [x] Verification path is concrete enough to execute without guesswork

---
*Template: `.agents/a-docs/templates/plan.md`*
