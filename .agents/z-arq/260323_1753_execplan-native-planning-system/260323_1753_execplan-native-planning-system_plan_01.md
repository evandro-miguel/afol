---
doc_type: plan
id: 260323_1753_execplan-native-planning-system_plan_01
theme: execplan-native-planning-system
status: final
owners:
- orchestrator
created_at: '2026-03-23T17:53:45-03:00'
updated_at: '2026-03-23T18:05:33-03:00'
roadmap_feature: F-12
parent_spec: 260323_1815_execplan-native-planning-system_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  brainstorm: 260323_1753_execplan-native-planning-system_brainstorm_01
  explorer_check: 260323_1753_execplan-native-planning-system_explorer-check_01
  research: 260323_1753_execplan-native-planning-system_research_01
  task: 260323_1753_execplan-native-planning-system_task_01
repo: agentic_start_folder
branch: main
---

# Plan: execplan-native-planning-system

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current as work proceeds. Follow `PLANS.md` from the repository root when writing or revising this file.

## Purpose / Big Picture
- The scaffold should produce stronger plans for long-running interactive CLI work. After this change, a workbench plan file should act as an ExecPlan: a self-contained execution document that a new contributor can resume from without reconstructing missing context from chat history.
- The user-visible outcome is twofold: operators get a better plan template and repo-level guidance, and strict verification can reject finalized plans that do not maintain the required living-document sections.

## Progress
- [x] 2026-03-23 17:54Z - Reviewed the current plan template, verifier, workflow docs, bootstrap surface, and relevant tests.
- [x] 2026-03-23 18:04Z - Read the official OpenAI cookbook guidance for `PLANS.md` and extracted the parts that map cleanly onto this scaffold.
- [x] 2026-03-23 18:16Z - Added a root `PLANS.md`, updated `AGENTS.md`, and upgraded the plan template toward an ExecPlan contract.
- [x] 2026-03-23 18:21Z - Added strict verifier rules and tests for required final-plan ExecPlan sections and checkbox-based progress.
- [x] 2026-03-23 18:26Z - Updated bootstrap/docs so downstream repos also receive the `PLANS.md` contract and operator guidance.
- [x] 2026-03-23 18:31Z - Validated targeted tests, markdown lint, script lint, bootstrap compatibility, full repo validation, and strict session verification.

## Surprises & Discoveries
- Observation: the official cookbook article was not directly discoverable through the local docs MCP index path, but the page was available on `developers.openai.com` when opened directly.
  Evidence: direct fetch/open of `https://developers.openai.com/cookbook/articles/codex_exec_plans`.
- Observation: bootstrap needed to export `PLANS.md` too, otherwise downstream repos would get `AGENTS.md` telling runtimes to follow a file that was never installed.
  Evidence: `agents-bootstrap.py` mandatory file list initially contained `AGENTS.md` but not `PLANS.md`.

## Decision Log
- Decision: keep the workbench plan as the canonical ExecPlan instead of introducing a second root-only plan workflow.
  Rationale: the scaffold already uses roadmap/spec/workbench governance; replacing that would create unnecessary duplication.
  Date/Author: 2026-03-23 / Codex
- Decision: enforce required ExecPlan sections only for finalized plans in strict verification.
  Rationale: this improves closure quality without breaking exploratory drafts or historical lightweight work-in-progress plans.
  Date/Author: 2026-03-23 / Codex
- Decision: add a root `PLANS.md` and export it through bootstrap.
  Rationale: the cookbook pattern depends on a canonical planning contract that runtimes can reference directly.
  Date/Author: 2026-03-23 / Codex

## Outcomes & Retrospective
- Outcome: the scaffold now has a canonical `PLANS.md`, an ExecPlan-oriented `plan.md` template, and strict verification for finalized plans.
- Remaining: future work could add richer progress heuristics or optional plan compaction rules, but that is outside this slice.
- Lesson: the strongest improvement came from adapting the cookbook to the scaffold's existing governance instead of copying the cookbook format literally.

## Governance Context
- Roadmap feature: `F-12`
- Parent spec: `260323_1815_execplan-native-planning-system_spec_01`
- Child spec: ``
- Planning rule:
  - Do not redefine feature philosophy here; use this file to plan execution of already-defined intent.
  - A major plan is not complete until brainstorm and explorer-check artifacts exist and are linked here.

## Planning Inputs
- Brainstorm artifact: `260323_1753_execplan-native-planning-system_brainstorm_01`
- Explorer check artifact: `260323_1753_execplan-native-planning-system_explorer-check_01`
- Research artifact: `260323_1753_execplan-native-planning-system_research_01`
- Knowledge lookup performed:
  - `./.agents/agents knowledge pull "plan template exec plan"` -> no reusable knowledge found, so local repo inspection plus official OpenAI docs research was used.

## Context and Orientation
- The current planning system is centered on `.agents/a-docs/templates/plan.md` and the workbench session folder under `.agents/wb/`.
- `AGENTS.md` defines workflow expectations for runtimes, while `verify-tasks.py` performs strict end-of-session checks.
- `agents-bootstrap.py` provisions the scaffold into downstream repos, so any canonical planning contract that lives at repository root must be bootstrapped too.

## Scope
- In scope:
  - root `PLANS.md`
  - `AGENTS.md` and template guidance for ExecPlans
  - workbench plan template upgrade
  - strict verification of final ExecPlan sections and progress
  - tests and bootstrap export for the new contract
- Out of scope:
  - replacing roadmap/spec/workbench governance
  - turning every historical plan into the new format

## Plan of Work
- First, add the canonical planning contract at repository root and align `AGENTS.md` and the template with the new ExecPlan expectations.
- Next, update the strict verifier so finalized plans must contain the living sections and a checkbox-based `Progress` section.
- Then, update tests and bootstrap so the contract is enforced locally and exported downstream.
- Finally, update the operator-facing docs and validate the full repo.

## Concrete Steps
1. Edit `AGENTS.md`, `.agents/a-docs/templates/plan.md`, and add `PLANS.md`.
2. Update `.agents/agents.config` and `.agents/scripts/lib/agents_config.py` with feature flags for ExecPlan checks.
3. Update `.agents/scripts/verify-tasks.py` and `.agents/scripts/tests/test_verify_tasks_strict.py`.
4. Update `.agents/scripts/agents-bootstrap.py` and `.agents/scripts/tests/test_runtime_compatibility.py`.
5. Update README and tool/docs references for planning, verify-tasks, new, and bootstrap.
6. Run targeted and full validations, then close the workstream artifacts.

## Interfaces and Dependencies
- Tools:
  - `./.agents/agents`
  - `make`
- MCPs:
  - OpenAI developer docs MCP for official source lookup
- Skills:
  - none required beyond the repo workflow itself
- Files and interfaces that must exist at the end:
  - `PLANS.md`
  - `.agents/a-docs/templates/plan.md`
  - `.agents/scripts/verify-tasks.py`
  - bootstrap mandatory file export including `PLANS.md`

## Risks and Mitigations
- Risk: copying the cookbook too literally would create a second planning system.
  Mitigation: adapt the cookbook into the existing workbench plan instead.
- Risk: stricter plan verification could break active workflows.
  Mitigation: enforce the new sections only for finalized plans in strict mode.

## Validation and Acceptance
- Unit: `./.agents/scripts/.venv/bin/pytest .agents/scripts/tests/test_verify_tasks_strict.py -q`
- E2E: `./.agents/agents bootstrap <tmpdir> --skip-checks` and confirm `PLANS.md` is exported
- Typecheck: `N/A`
- Lint: `make lint && make lint-scripts`
- Behavioral acceptance:
  - a new repo bootstrapped from this scaffold includes `PLANS.md`
  - finalized plans without ExecPlan sections fail strict verification
  - finalized plans with the new template structure pass strict verification

## Idempotence and Recovery
- The doc/template/config changes are additive and safe to re-run.
- If verification fails after a partial change, rerun the targeted pytest suites before escalating to full repo validation.

## Artifacts and Notes
- Official source used for the adaptation:
  - `https://developers.openai.com/cookbook/articles/codex_exec_plans`
- Companion cookbook with practical `ExecPlan` usage:
  - `https://developers.openai.com/cookbook/examples/codex/code_modernization/`

## Completion Gate
- [x] Brainstorm exists and reflects real option analysis
- [x] Explorer check proves current-project inspection happened
- [x] Relevant prior knowledge was searched or explicitly ruled out
- [x] The ExecPlan remains self-contained enough for a new contributor to resume
- [x] Progress entries reflect the actual current state
- [x] Validation path is concrete enough to execute without guesswork

---
*Template: `.agents/a-docs/templates/plan.md`*
