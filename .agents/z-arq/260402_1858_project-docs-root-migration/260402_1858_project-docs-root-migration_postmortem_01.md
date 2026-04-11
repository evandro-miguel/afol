---
doc_type: postmortem
id: 260402_1858_project-docs-root-migration_postmortem_01
theme: project-docs-root-migration
status: final
owners:
- orchestrator
created_at: '2026-04-02T18:58:13-03:00'
updated_at: '2026-04-02T20:36:36-03:00'
roadmap_feature: F-11
parent_spec: 260323_1741_current-state-maps-and-goal-state-governance_spec_01
child_spec: ''
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  plan: 260402_1858_project-docs-root-migration_plan_01
  task: 260402_1858_project-docs-root-migration_task_01
  report: 260402_1858_project-docs-root-migration_report_01
---

# Postmortem: project-docs-root-migration

## Goal
- Capture what happened in the session so future agents can reuse the real outcome instead of reconstructing it.

## Expected Outcome
- Move project-owned documentation out of `.agents/`, retarget the scaffold to `docs/`, and keep bootstrap/validation fully green.

## What Was Achieved
- The docs contract now lives in `docs/`, the runtime and bootstrap honor that split, and the scaffold passed `make all` after regenerating derived artifacts.

## What Did Not Land
- No blocking follow-up remained inside this slice.

## Problems Encountered
- Moving folders before retargeting consumers temporarily left the repo in an intentionally broken middle state.

## Root Causes
- Path assumptions were spread across config, bootstrap, tests, wrappers, docs, and generated artifacts.

## Useful Discoveries
- `wb-update touch --session <id>` updates every markdown artifact in the session, which is the fastest safe way to normalize `updated_at` after a big documentation pass.
- `make repo-map` was required after the migration to flush stale generated narrative inside `docs/map/`.

## Follow-ups for Next Rounds
- Keep using `docs/` for project canon and reserve `.agents/` for runtime/workbench state only.

## Final Assessment
- Session outcome: successful
- Should a new feature or child spec be created from this postmortem: no

---
*Template: `docs/templates/postmortem.md`*
