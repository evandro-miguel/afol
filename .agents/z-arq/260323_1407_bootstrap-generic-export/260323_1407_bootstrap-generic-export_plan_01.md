---
doc_type: plan
id: 260323_1407_bootstrap-generic-export_plan_01
theme: bootstrap-generic-export
status: final
owners:
- orchestrator
created_at: '2026-03-23T14:07:57-03:00'
updated_at: '2026-03-23T14:18:47-03:00'
roadmap_feature: F-04
parent_spec: 260306_roadmap-first-delivery-system_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  brainstorm: 260323_1407_bootstrap-generic-export_brainstorm_01
  explorer_check: 260323_1407_bootstrap-generic-export_explorer-check_01
  research: 260323_1407_bootstrap-generic-export_research_01
  task: 260323_1407_bootstrap-generic-export_task_01
repo: agentic_start_folder
branch: main
---

# Plan: bootstrap-generic-export

## Objective
- Deliver work for roadmap feature `F-04` within the boundaries defined by parent spec `260306_roadmap-first-delivery-system_spec_01`.

## Scope
- In scope:
  - Sanitize bootstrap output so downstream repos do not inherit scaffold-local history.
  - Generate valid starter governance docs for `arc` instead of copying this repo's live backlog/specs.
  - Add regression coverage and update canonical bootstrap documentation.
- Out of scope:
  - Changing normal in-repo workbench behavior.
  - Reworking optional skills-sync content from the upstream pool.

## Governance Context
- Roadmap feature: `F-04`
- Parent spec: `260306_roadmap-first-delivery-system_spec_01`
- Child spec: ``
- Planning rule:
  - Do not redefine feature philosophy here; use this file to plan execution of already-defined intent.
  - A major plan is not complete until brainstorm and explorer-check artifacts exist and are linked here.

## Planning Inputs
- Brainstorm artifact: `260323_1407_bootstrap-generic-export_brainstorm_01`
- Explorer check artifact: `260323_1407_bootstrap-generic-export_explorer-check_01`
- Research artifact: `260323_1407_bootstrap-generic-export_research_01`
- Knowledge lookup performed:
  - `./.agents/agents knowledge pull "bootstrap export generic scaffold"` -> no reusable knowledge found.

## Success Criteria
- Bootstrapped targets contain generic starter governance files and omit scaffold-local workbench/knowledge/lesson/report history.
- `./.agents/agents bootstrap <tmpdir>` succeeds with post-checks enabled in a fresh target repo.
- Runtime regression coverage proves the bootstrap contract.

## Delivery Strategy
1. Narrow bootstrap copy scope and add sanitized directory handling plus generated baseline files.
2. Add runtime tests that assert the exported target is generic and usable.
3. Update bootstrap documentation and record the lesson/validation evidence.

## Critical Dependencies
- Tools:
  - `.agents/agents bootstrap`
  - `make lint-scripts`
  - `make test-scripts`
- MCPs:
  - none
- Skills:
  - `projects-workflow`
  - `docs-operations`
- Executor instruction:
  - Validate the real bootstrap path in a temporary target repo, not just unit tests.

## Large Plan Handling
- If this plan exceeds 500 lines, split into phases.
- Create one task file per phase.

## Risks and Mitigations
- Risk: generic roadmap/spec placeholders fail governance checks -> Mitigation: generate starter parent specs and align roadmap/index references.
- Risk: sanitization removes required reusable docs -> Mitigation: verify bootstrap end-to-end with post-checks enabled.

## Verification Plan
- Unit: `make test-scripts`
- E2E: `./.agents/agents bootstrap <tmpdir>` and `./.agents/agents bootstrap <tmpdir> --skip-checks`
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
