---
doc_type: plan
id: 260402_1858_project-docs-root-migration_plan_01
theme: project-docs-root-migration
status: final
owners:
- orchestrator
created_at: 2026-04-02 18:58:13-03:00
updated_at: '2026-04-02T20:36:36-03:00'
roadmap_feature: F-11
parent_spec: 260323_1741_current-state-maps-and-goal-state-governance_spec_01
child_spec: null
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  brainstorm: 260402_1858_project-docs-root-migration_brainstorm_01
  explorer_check: 260402_1858_project-docs-root-migration_explorer-check_01
  research: 260402_1858_project-docs-root-migration_research_01
  task: 260402_1858_project-docs-root-migration_task_01
repo: agentic_start_folder
branch: feat/scaffold-runtime-governance-hardening
---

# Plan: project-docs-root-migration

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current as work proceeds. Follow `PLANS.md` from the repository root when writing or revising this file.

## Purpose / Big Picture
- Move project-owned documentation out of `.agents/` and into `docs/` so the scaffold cleanly separates agent runtime state from repository canon.
- Prove that bootstrap, docs, config, tests, and generated maps still work after the migration and that downstream repos receive only the useful scaffold surface.

## Progress
- [x] 2026-04-02 19:00-03:00 - Moved canonical project docs from `.agents/a-docs` and `.agents/arc` into `docs/` and removed the old source folders.
- [x] 2026-04-02 19:20-03:00 - Retargeted config, runtime scripts, bootstrap, Makefiles, wrappers, opencode adapter, tests, and canonical docs to the new `docs/` contract.
- [x] 2026-04-02 19:45-03:00 - Regenerated `docs/arc/structure`, refreshed `docs/map`, rebuilt indexes, synced runtime mirrors, and validated with `make all`.

## Surprises & Discoveries
- Observation: moving the folders first exposed a wide surface of path assumptions in bootstrap, tests, and generated docs.
  Evidence: `rg -n "\.agents/(a-docs|arc|templates)" . -S --glob '!.agents/wb/**' --glob '!.git/**'`
- Observation: `docs/map/` stayed semantically stale until `repo-map` was rerun after the code-path migration.
  Evidence: `make repo-map`

## Decision Log
- Decision: reserve `.agents/` for agent runtime surfaces only, and move project-facing canon to `docs/`.
  Rationale: project docs must remain repository-owned and bootstrapable without being confused with workbench/runtime state.
  Date/Author: 2026-04-02 / orchestrator
- Decision: keep `docs/map/` as current-state evidence and `docs/arc/` as goal-state canon.
  Rationale: the split already exists conceptually; the migration made the ownership boundary explicit and enforceable.
  Date/Author: 2026-04-02 / orchestrator

## Outcomes & Retrospective
- Outcome: the scaffold now reads, writes, bootstraps, and validates against `docs/` for project-owned documentation while `.agents/` remains agent-system-only.
- Remaining: no blocking runtime work remains in this slice; residual historical mentions survive only inside knowledge summaries about past states.
- Lesson: for path migrations, move the canon first, then immediately retarget bootstrap/tests/config together before trusting any generated artifacts.

## Governance Context
- Roadmap feature: `F-11`
- Parent spec: `260323_1741_current-state-maps-and-goal-state-governance_spec_01`
- Child spec: ``
- Planning rule:
  - Do not redefine feature philosophy here; use this file to plan execution of already-defined intent.
  - A major plan is not complete until brainstorm and explorer-check artifacts exist and are linked here.

## Planning Inputs
- Brainstorm artifact: `260402_1858_project-docs-root-migration_brainstorm_01`
- Explorer check artifact: `260402_1858_project-docs-root-migration_explorer-check_01`
- Research artifact: `260402_1858_project-docs-root-migration_research_01`
- Knowledge lookup performed:
  - `rg -n "\.agents/(a-docs|arc|templates)" . -S --glob '!.agents/wb/**' --glob '!.git/**'` to inventory all legacy contract references.
  - Prior migration sessions under `.agents/wb/260402_1828_docs-map-contract-migration` and `.agents/wb/260402_1847_global-docs-surface-propagation`.

## Context and Orientation
- This repo is a reusable scaffold for interactive CLI agents. `.agents/` contains runtime automation, workbench state, skills, rules, telemetry data, and wrappers.
- `docs/` is now the project-owned documentation surface: `docs/arc/` for goal-state canon, `docs/map/` for current-state evidence, `docs/standards/` and `docs/templates/` for documented workflow contracts, and supporting directories for lessons, patterns, telemetry docs, and agentic references.
- The migration touched `.agents/agents.config`, `.agents/scripts/lib/agents_config.py`, `.agents/scripts/agents-bootstrap.py`, `.agents/scripts/agents-doctor.py`, `.agents/scripts/agents-structure-map.py`, `.agents/scripts/agents-repo-map.py`, root docs, and the test harness in `.agents/scripts/tests/`.

## Scope
- In scope:
  - Move canonical project docs from legacy `.agents/a-docs` and `.agents/arc` locations into `docs/`.
  - Retarget runtime/config/bootstrap/tests/docs to the new paths.
  - Regenerate derived documentation and validate the scaffold end to end.
- Out of scope:
  - Changing the semantic workflow model for workbench sessions under `.agents/wb/`.
  - Rewriting historical workbench content beyond what is needed for governed evidence.

## Plan of Work
- First, move the project canon into `docs/` and define the final taxonomy (`docs/arc`, `docs/standards`, `docs/templates`, `docs/knowledge`, `docs/lessons`, `docs/patterns`, `docs/telemetry`, `docs/map`).
- Second, retarget the loader and all runtime consumers so the scaffold resolves the new paths from config instead of hardcoding `.agents/a-docs` or `.agents/arc`.
- Third, update bootstrap so downstream repos inherit the useful project docs under `docs/` while leaving workbench/history behind.
- Fourth, refresh tests and generated artifacts, then run the full validation gate.

## Concrete Steps
1. Move `.agents/a-docs` and `.agents/arc` content into `docs/` and remove the empty legacy directories.
2. Update `.agents/agents.config` and `.agents/scripts/lib/agents_config.py`, then retarget the affected command modules and bootstrap/test harnesses.
3. Sync runtime mirrors, regenerate structure/map/index artifacts, and validate with `make lint-scripts`, targeted pytest, `make repo-map`, `make doctor`, and `make all`.

## Interfaces and Dependencies
- Tools:
  - `make`, `uv`, `pytest`, `ruff`, `docker`
- MCPs:
  - none required for the migration itself
- Skills:
  - `agentic-system-workflow`
  - `workbench-agent-teams`
- Files and interfaces that must exist at the end:
  - `docs/arc/GENERAL-ROADMAP.md`, `docs/arc/SPECS/`, `docs/standards/`, `docs/templates/`, `docs/map/`
  - `.agents/agents.config` path contract and loader parity in `.agents/scripts/lib/agents_config.py`
  - bootstrap path contract in `.agents/scripts/agents-bootstrap.py`

## Risks and Mitigations
- Risk: downstream bootstrap inherits source-repo history or stale generated artifacts -> Mitigation: bootstrap only copies reusable canon, regenerates baseline docs, and excludes workbench/current-state artifacts.
- Risk: path drift breaks runtime commands or tests -> Mitigation: update config first, then validate with targeted tests and `make all`.

## Validation and Acceptance
- Unit: `uv run --project .agents/scripts pytest .agents/scripts/tests/test_runtime_compatibility.py .agents/scripts/tests/integration/test_critical_workflows.py .agents/scripts/tests/test_verify_tasks_strict.py .agents/scripts/tests/test_agents_repo_map.py -q`
- E2E: N/A
- Typecheck: N/A
- Lint: `make lint-scripts`
- Behavioral acceptance:
  - `make doctor` passes with required folders now rooted in `docs/`.
  - `make repo-map` refreshes `docs/map/` without reintroducing `.agents/a-docs` references.
  - `make all` passes after the migration.

## Idempotence and Recovery
- `make structure`, `make index`, `make knowledge-index`, `./.agents/agents sync --force`, and `make repo-map` are safe to rerun.
- If the move leaves references broken midway, rerun the `rg` inventory against `\.agents/(a-docs|arc|templates)` and retarget consumers before trusting generated docs.

## Artifacts and Notes
- Key commands:
  - `./.agents/agents sync --force`
  - `make structure`
  - `make index`
  - `make knowledge-index`
  - `make repo-map`
  - `make doctor`
  - `make all`
- Key files:
  - `.agents/agents.config`
  - `.agents/scripts/lib/agents_config.py`
  - `.agents/scripts/agents-bootstrap.py`
  - `docs/standards/Makefile`
  - `Makefile`
  - `AGENTS.md`
  - `opencode.json`

## Completion Gate
- [x] Brainstorm exists and reflects real option analysis
- [x] Explorer check proves current-project inspection happened
- [x] Relevant prior knowledge was searched or explicitly ruled out
- [x] The ExecPlan remains self-contained enough for a new contributor to resume
- [x] Progress entries reflect the actual current state
- [x] Validation path is concrete enough to execute without guesswork

---
*Template: `docs/templates/plan.md`*
