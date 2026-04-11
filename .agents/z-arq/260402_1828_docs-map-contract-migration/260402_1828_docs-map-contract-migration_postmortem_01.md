---
doc_type: postmortem
id: 260402_1828_docs-map-contract-migration_postmortem_01
theme: docs-map-contract-migration
status: final
created_at: '2026-04-02T18:28:00-03:00'
updated_at: '2026-04-02T18:40:44-03:00'
roadmap_feature: F-11
parent_spec: 260323_1741_current-state-maps-and-goal-state-governance_spec_01
child_spec: 260323_1750_current-state-map-contract_spec_01
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260402_1828_docs-map-contract-migration_plan_01
  task: 260402_1828_docs-map-contract-migration_task_01
  report: 260402_1828_docs-map-contract-migration_report_01
---

# Postmortem: docs-map-contract-migration

## What Worked
- Retargeting the map contract through config first kept the command/runtime
  layer coherent while the documentation migration was still in progress.
- Downstream bootstrap proof caught the real user requirement: it was not
  enough to move the path; the export also had to remain history-free.

## What Hurt
- The work exposed a hidden drift between project-local skills and the
  repo-local source seed. `make all` only warned, so the inconsistency could
  have shipped if `skills-sync check` had not been run explicitly.

## Prevention
- When a local skill changes, immediately check whether the matching source-seed
  copy under `.agents/source/universal-skills` also needs the same edit.
- Treat current-state map path migrations as contract changes across runtime,
  bootstrap, docs, tests, and generated artifacts, not as a one-file script
  patch.
