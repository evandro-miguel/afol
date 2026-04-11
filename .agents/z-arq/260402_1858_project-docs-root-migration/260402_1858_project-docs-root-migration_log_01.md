---
doc_type: log
id: 260402_1858_project-docs-root-migration_log_01
theme: project-docs-root-migration
status: final
created_at: '2026-04-02T18:58:13-03:00'
updated_at: '2026-04-02T20:36:36-03:00'
roadmap_feature: F-11
parent_spec: 260323_1741_current-state-maps-and-goal-state-governance_spec_01
child_spec: ''
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  plan: 260402_1858_project-docs-root-migration_plan_01
  task: 260402_1858_project-docs-root-migration_task_01
---

# Log: project-docs-root-migration

## Governance Context
- Roadmap feature: `F-11`
- Parent spec: `260323_1741_current-state-maps-and-goal-state-governance_spec_01`
- Child spec: ``

## Timeline
- 2026-04-02 18:58 - moved legacy `.agents/a-docs` and `.agents/arc` trees into `docs/` - filesystem canon migrated
- 2026-04-02 19:03 - retargeted config, runtime scripts, bootstrap, Makefiles, opencode adapter, and tests - code contract aligned
- 2026-04-02 19:08 - synced runtime mirrors and regenerated `docs/arc/structure`, spec index, and knowledge index - derived docs refreshed
- 2026-04-02 19:11 - reran `make repo-map` - `docs/map/` refreshed against new contract
- 2026-04-02 19:15 - ran `make doctor` and `make all` - scaffold validation fully green
- 2026-04-02 20:17 - final mini-agent audit with `repo-analysis` and `rag-docs` found residual drift in rules, runtime adapters, stale structure artifacts, and a legacy updater surface
- 2026-04-02 20:28 - retargeted remaining live docs/rules/runtime adapters, hardened `agents-structure-map.py`, archived legacy `agents-update`, and cleaned tmp repo-map artifacts
- 2026-04-02 20:35 - reran `make doctor`, `make lint`, `skills-sync check`, universal-skills sync check, `make repo-map`, `make structure`, `verify-tasks --strict`, and `make all` - release gate green

## Decisions
- `docs/` owns project documentation; `.agents/` owns runtime/workbench state -> enforces a clean downstream bootstrap boundary
- `docs/map/` remains descriptive current-state evidence while `docs/arc/` carries goal-state canon -> keeps map vs governance split explicit

## Blockers
- none

## Next Step
- commit and push the release-safe closure state

---
*Template: `docs/templates/log.md`*
