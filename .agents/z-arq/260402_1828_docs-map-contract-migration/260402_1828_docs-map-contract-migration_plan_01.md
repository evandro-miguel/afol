---
doc_type: plan
id: 260402_1828_docs-map-contract-migration_plan_01
theme: docs-map-contract-migration
status: final
owners:
- orchestrator
created_at: '2026-04-02T18:28:00-03:00'
updated_at: '2026-04-02T18:40:44-03:00'
roadmap_feature: F-11
parent_spec: 260323_1741_current-state-maps-and-goal-state-governance_spec_01
child_spec: 260323_1750_current-state-map-contract_spec_01
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  brainstorm: 260402_1828_docs-map-contract-migration_brainstorm_01
  explorer_check: 260402_1828_docs-map-contract-migration_explorer-check_01
  task: 260402_1828_docs-map-contract-migration_task_01
repo: agentic_start_folder
branch: feat/scaffold-runtime-governance-hardening
---

# Plan: docs-map-contract-migration

## Purpose / Big Picture
- Move the current-state repository map contract from `.agents/arc/map/` to
  `docs/map/` at the project root.
- Keep goal-state governance under `.agents/arc/` and workbench execution under
  `.agents/wb/`.
- Ensure bootstrap exports only the reusable scaffold surface and does not copy
  local workbench sessions or other repo-specific execution artifacts.

## Progress
- [x] 2026-04-02 18:28-03:00 - Audited the current contract and confirmed the runtime, docs, and tests still hardcode `.agents/arc/map/`.
- [x] 2026-04-02 18:47-03:00 - Retargeted config, wrapper help, `repo-map`, bootstrap, and tests to `docs/map/`.
- [x] 2026-04-02 18:58-03:00 - Removed export of source-repo map artifacts from bootstrap and generated a generic `docs/map/README.md` baseline instead.
- [x] 2026-04-02 19:10-03:00 - Updated canonical docs, standards, roadmap, specs, and the compatibility `deep-code-analisys` skill references to the new map contract.
- [x] 2026-04-02 19:32-03:00 - Revalidated repo gates, regenerated the codemap under `docs/map/`, refreshed structure docs, and passed downstream full/partial bootstrap verification.

## Surprises & Discoveries
- The newly updated global MCP/router skills still reference `.agents/arc/map/`,
  so this migration must explicitly update the scaffold contract instead of
  assuming the skill layer already moved.
- The current repo does not have a root `docs/` directory yet, so the migration
  changes both path ownership and generated output expectations.
- `repo-map --dry-run` initially showed only the shadow output path, not the
  final `docs/map/` root. The command needed an explicit final-output print so
  operators can see the real contract before execution.
- `make all` exposed a real `skills-sync` drift warning after the skill docs
  changed. The local source seed had to be updated so project-local skills and
  `.agents/source/universal-skills` stayed in sync.

## Decision Log
- Decision: use `docs/map/` as the current-state map surface instead of
  `docs/` flat.
  Rationale: it keeps descriptive map artifacts grouped while leaving room for
  other root docs without mixing current-state codemap output with unrelated
  documentation.
  Date/Author: 2026-04-02 / Codex
- Decision: bootstrap must not export `.agents/wb/`, `.agents/wb/.active_session`,
  or local workstream artifacts from this repo.
  Rationale: downstream repos should receive the reusable scaffold, not the
  implementation history of this source repository.
  Date/Author: 2026-04-02 / Codex

## Outcomes & Retrospective
- Outcome: the scaffold now treats `docs/map/` as the canonical current-state
  map surface, while `.agents/arc/` remains goal-state canon and `.agents/wb/`
  remains execution history.
- Outcome: bootstrap now provisions only a generic `docs/map/README.md`
  baseline and explicitly avoids exporting source-repo workbench state or
  source-specific codemap artifacts.
- Outcome: the local repo was migrated and regenerated successfully, so the
  committed codemap and structure docs already reflect the new contract.

## Scope
- In scope:
  - Config defaults and command/runtime behavior for repo-map output.
  - Bootstrap export hygiene for workbench and local execution artifacts.
  - Docs/tests/spec updates needed to keep the new contract coherent.
- Out of scope:
  - Rewriting the full generated map content taxonomy beyond what is needed for
    the path migration.
  - Changing the role of workbench or roadmap/spec governance.

## Context and Orientation
- The scaffold previously treated `.agents/arc/map/` as the current-state map
  surface in runtime defaults, standards, and generated output.
- The new contract moves that surface to `docs/map/` at the repo root while
  keeping `.agents/arc/` as goal-state canon and `.agents/wb/` as execution
  history.
- Bootstrap must remain history-free when exporting this scaffold into another
  repository.

## Plan of Work
- Retarget the runtime/config layer first so commands and generated output land
  in `docs/map/`.
- Remove source-repo current-state map export from bootstrap and replace it with
  a generic baseline document.
- Migrate canonical docs, roadmap/specs, and compatibility skill references.
- Revalidate locally and in downstream bootstrap targets.

## Concrete Steps
1. Update `map_dir`, `repo-map`, wrapper/help, and doctor checks.
2. Update bootstrap copy rules and generated baseline content.
3. Retarget tests, standards, README, roadmap, specs, and compatibility skill
   docs.
4. Regenerate `docs/map/` and `.agents/arc/structure/`.
5. Run focused tests, repo gates, and downstream full/partial bootstrap proof.

## Validation and Acceptance
- `repo-map` defaults to `docs/map/` and prints the final output root in
  `--dry-run`.
- Bootstrap targets receive `docs/map/README.md` but no source `.agents/wb/`
  history and no `.agents/arc/map`.
- Local repo validation passes through `make doctor`, `make all`, and
  `skills-sync check`.
- Downstream full and partial bootstrap paths both pass with the new contract.

## Idempotence and Recovery
- Re-running bootstrap should preserve the history-free baseline and not create
  `.agents/wb/.active_session` in the target repo.
- Re-running `repo-map` should replace the generated `docs/map/` output cleanly.
- Legacy `.agents/arc/map` remains excluded from analysis so stale artifacts do
  not contaminate the new output root during migration.

## Artifacts and Notes
- Runtime/config changes live under `.agents/scripts/`, `.agents/agents.config`,
  `.agents/agents`, and `.agents/tools.json`.
- Canonical docs/spec changes live under `.agents/a-docs/standards/`,
  `.agents/arc/`, `README.md`, and `.agents/scripts/README.md`.
- Generated current-state artifacts now live under `docs/map/`.

## Interfaces and Dependencies
- External dependency: `run-repo-map.sh` from `docker-analisys-tools`.
- Internal interfaces: `.agents/agents repo-map`, bootstrap, doctor,
  `skills-sync check`, and downstream `make agents-all`.
- Dependent docs: F-11 roadmap/spec set plus bootstrap and repo-map standards.
