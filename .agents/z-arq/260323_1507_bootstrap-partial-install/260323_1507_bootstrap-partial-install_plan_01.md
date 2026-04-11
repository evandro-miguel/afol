---
doc_type: plan
id: 260323_1507_bootstrap-partial-install_plan_01
theme: bootstrap-partial-install
status: final
owners:
- orchestrator
created_at: '2026-03-23T15:07:03-03:00'
updated_at: '2026-03-23T15:24:34-03:00'
roadmap_feature: F-04
parent_spec: 260306_roadmap-first-delivery-system_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  brainstorm: 260323_1507_bootstrap-partial-install_brainstorm_01
  explorer_check: 260323_1507_bootstrap-partial-install_explorer-check_01
  research: 260323_1507_bootstrap-partial-install_research_01
  task: 260323_1507_bootstrap-partial-install_task_01
repo: agentic_start_folder
branch: main
---

# Plan: bootstrap-partial-install

## Objective
- Deliver work for roadmap feature `F-04` within the boundaries defined by parent spec `260306_roadmap-first-delivery-system_spec_01`.

## Scope
- In scope:
  - Add explicit partial-install support to bootstrap for already-running projects.
  - Remove residual cleanliness warnings from fresh/partial bootstrap targets.
  - Align documentation and Makefile usage with the new install mode.
- Out of scope:
  - Reworking upstream skill content itself.
  - Changing the semantics of existing governed workstreams beyond bootstrap adoption.

## Governance Context
- Roadmap feature: `F-04`
- Parent spec: `260306_roadmap-first-delivery-system_spec_01`
- Child spec: ``
- Planning rule:
  - Do not redefine feature philosophy here; use this file to plan execution of already-defined intent.
  - A major plan is not complete until brainstorm and explorer-check artifacts exist and are linked here.

## Planning Inputs
- Brainstorm artifact: `260323_1507_bootstrap-partial-install_brainstorm_01`
- Explorer check artifact: `260323_1507_bootstrap-partial-install_explorer-check_01`
- Research artifact: `260323_1507_bootstrap-partial-install_research_01`
- Knowledge lookup performed:
  - `./.agents/agents knowledge pull "bootstrap partial install existing project warnings lint skills docs"` -> no reusable knowledge found.

## Success Criteria
- `./.agents/agents bootstrap <target> --partial` installs the scaffold into an existing repo and preserves pre-existing files unless `--force` is used.
- Fresh and partial bootstrap targets pass `doctor`, `lint`, and `test-scripts` without bootstrap-specific warnings.
- Local docs and Makefile usage expose the new partial-install path explicitly.

## Delivery Strategy
1. Add explicit partial-install mode and adoption-oriented generated baseline in `agents-bootstrap.py`.
2. Remove residual target-validation noise from synced skill docs, active-session handling, and generated IDs.
3. Update tests, docs, and validation evidence for both full and partial install flows.

## Critical Dependencies
- Tools:
  - `.agents/agents bootstrap`
  - `make lint`
  - `make test-scripts`
  - `make all`
- MCPs:
  - none
- Skills:
  - `projects-workflow`
  - `docs-operations`
- Executor instruction:
  - Validate both a fresh repo and an existing project repo with the real bootstrap command.

## Large Plan Handling
- If this plan exceeds 500 lines, split into phases.
- Create one task file per phase.

## Risks and Mitigations
- Risk: partial install still behaves like implicit full bootstrap -> Mitigation: add explicit CLI flag, tests, and docs.
- Risk: cleaning lint/doctor noise accidentally hides real problems -> Mitigation: exclude imported skills from markdown lint only because `skills-check` already validates them; keep real `.agents` governance checks intact.

## Verification Plan
- Unit: `make test-scripts`
- E2E: `./.agents/agents bootstrap <tmpdir>` and `./.agents/agents bootstrap <tmpdir> --partial`
- Typecheck: N/A
- Lint: `make lint` and `make lint-scripts`
- Other checks:
  - `make doctor`
  - `make all`
  - `PATH=/usr/bin:/bin ./.agents/agents doctor`

## Completion Gate
- [x] Brainstorm exists and reflects real option analysis
- [x] Explorer check proves current-project inspection happened
- [x] Relevant prior knowledge was searched or explicitly ruled out
- [x] Verification path is concrete enough to execute without guesswork

---
*Template: `.agents/a-docs/templates/plan.md`*
