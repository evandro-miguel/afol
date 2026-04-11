---
doc_type: plan
id: 260323_1813_repo-map-system_plan_01
theme: repo-map-system
status: active
owners:
- orchestrator
created_at: 2026-03-23 18:13:06-03:00
updated_at: '2026-03-23T18:30:47-03:00'
roadmap_feature: F-11
parent_spec: 260323_1741_current-state-maps-and-goal-state-governance_spec_01
child_spec: 260323_1750_current-state-map-contract_spec_01
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  brainstorm: 260323_1813_repo-map-system_brainstorm_01
  explorer_check: 260323_1813_repo-map-system_explorer-check_01
  research: 260323_1813_repo-map-system_research_01
  task: 260323_1813_repo-map-system_task_01
repo: agentic_start_folder
branch: main
---

# Plan: repo-map-system

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current as work proceeds. Follow `PLANS.md` from the repository root when writing or revising this file.

## Purpose / Big Picture
- This change turns `arc/map/` into an operational current-state mapping system instead of a documented idea.
- An operator should be able to run `.agents/agents repo-map .` and get a refreshed codemap under `.agents/arc/map/`, then use those artifacts as evidence while keeping roadmap/spec/workbench as authority.

## Progress
- [x] 2026-03-23 21:13Z - Compared the scaffold against OpenCode's `repo-organizer` and the external `run-repo-map.sh` backend.
- [x] 2026-03-23 21:18Z - Added config, wrapper, make target, tools catalog entry, and `agents-repo-map.py`.
- [ ] 2026-03-23 21:xxZ - Finish command docs/tests and run a real codemap refresh for this repository.

## Surprises & Discoveries
- Observation: the scaffold already provisioned `arc/map/` through bootstrap, so the real gap was command/runtime wiring, not folder structure.
  Evidence: `agents-bootstrap.py` and `.agents/arc/map/README.md`

## Decision Log
- Decision: wrap the external toolbox runner instead of reimplementing the full OpenCode `repo-organizer` prompt inside this repository.
  Rationale: keeps `.agents` canonical and imports only the reusable operational contract.
  Date/Author: 2026-03-23 21:13Z / orchestrator

## Outcomes & Retrospective
- Outcome: the scaffold now has the skeleton of a first-class `repo-map` command surface.
- Remaining: validate the command, generate the actual map, and close the session docs cleanly.
- Lesson: `repo-organizer` is best copied as an artifact contract plus runner integration, not as a prompt verbatim.

## Governance Context
- Roadmap feature: `F-11`
- Parent spec: `260323_1741_current-state-maps-and-goal-state-governance_spec_01`
- Child spec: `260323_1750_current-state-map-contract_spec_01`
- Planning rule:
  - Do not redefine feature philosophy here; use this file to plan execution of already-defined intent.
  - A major plan is not complete until brainstorm and explorer-check artifacts exist and are linked here.

## Planning Inputs
- Brainstorm artifact: `260323_1813_repo-map-system_brainstorm_01`
- Explorer check artifact: `260323_1813_repo-map-system_explorer-check_01`
- Research artifact: `260323_1813_repo-map-system_research_01`
- Knowledge lookup performed:
  - Read `~/.config/opencode/agent/repo-organizer.md`
  - Read `~/apps/docker-analisys-tools/scripts/run-repo-map.sh`
  - Read local `structure-map` and `arc/map` docs

## Context and Orientation
- The scaffold already has `structure-map` for lightweight physical layout at `.agents/arc/structure/`.
- It already has the concept of a richer current-state surface at `.agents/arc/map/`, but until this workstream it lacked a native refresh command.
- OpenCode solves that problem with a `repo-organizer` role and an external runner at `~/apps/docker-analisys-tools/scripts/run-repo-map.sh`.

## Scope
- In scope:
  - add the native `repo-map` command surface
  - document the workflow in standards and command references
  - validate the script contract
  - generate the first real codemap for this repository
- Out of scope:
  - importing OpenCode's whole agent roster
  - changing roadmap/spec/workbench governance

## Plan of Work
- Add one script wrapper that resolves repo, output, runner, and image, then delegates to the existing external map runner.
- Wire the command into `.agents/agents`, `.agents/a-docs/standards/Makefile`, `.agents/tools.json`, and the command/reference docs.
- Add one dedicated standard for `repo-map` and position it relative to `structure-map`.
- Validate via `make doctor`, `make lint`, and `make test-scripts`, then run the new command against this repository.

## Concrete Steps
1. Implement `agents-repo-map.py` and wire it into wrapper/config/catalog files.
2. Update standards/docs to describe the heavy codemap workflow separately from `structure-map`.
3. Add targeted script tests for dry-run, runner invocation, and missing-doc failure.
4. Run validation and then execute `.agents/agents repo-map .`.

## Interfaces and Dependencies
- Tools:
  - `.agents/agents repo-map`
  - `make repo-map`
- MCPs:
  - none
- Skills:
  - `deep-code-analisys` as the upstream workflow contract
- Files and interfaces that must exist at the end:
  - `.agents/scripts/agents-repo-map.py`
  - `.agents/a-docs/standards/repo-map.md`
  - `.agents/arc/map/*.md`
  - `.agents/arc/map/extra/`

## Risks and Mitigations
- Risk: the toolbox runner is unavailable on another machine -> Mitigation: keep runner path configurable and make failure mode explicit.
- Risk: generated docs overwrite the placeholder `arc/map/README.md` -> Mitigation: keep the governance contract in `.agents/arc/README.md` and the child spec, and let `map/README.md` become the actual current-state index.

## Validation and Acceptance
- Unit: `make test-scripts`
- E2E: `N/A`
- Typecheck: `N/A`
- Lint: `make lint`
- Behavioral acceptance:
  - `.agents/agents repo-map . --dry-run` resolves the runner cleanly
  - `.agents/agents repo-map .` generates `.agents/arc/map/*.md` and `.agents/arc/map/extra/`
  - `status` continues to point to `.agents/arc/map/README.md` as current-state evidence

## Idempotence and Recovery
- The script and docs updates are safe to rerun.
- The codemap command may be re-run whenever artifacts are stale; it is a refresh workflow by design.

## Artifacts and Notes
- OpenCode contract: `~/.config/opencode/agent/repo-organizer.md`
- External runner: `~/apps/docker-analisys-tools/scripts/run-repo-map.sh`

## Completion Gate
- [x] Brainstorm exists and reflects real option analysis
- [x] Explorer check proves current-project inspection happened
- [x] Relevant prior knowledge was searched or explicitly ruled out
- [x] The ExecPlan remains self-contained enough for a new contributor to resume
- [x] Progress entries reflect the actual current state
- [x] Validation path is concrete enough to execute without guesswork

---
*Template: `.agents/a-docs/templates/plan.md`*
