---
doc_type: log
id: 260402_1828_docs-map-contract-migration_log_01
theme: docs-map-contract-migration
status: active
created_at: '2026-04-02T18:28:00-03:00'
updated_at: '2026-04-02T18:40:44-03:00'
roadmap_feature: F-11
parent_spec: 260323_1741_current-state-maps-and-goal-state-governance_spec_01
child_spec: 260323_1750_current-state-map-contract_spec_01
links:
  plan: 260402_1828_docs-map-contract-migration_plan_01
  task: 260402_1828_docs-map-contract-migration_task_01
---

# Log: docs-map-contract-migration

- 2026-04-02 18:28-03:00 - Started migration session for `repo-map -> docs/map`
  and bootstrap export hardening.
- 2026-04-02 18:41-03:00 - Retargeted runtime defaults, wrapper help, and
  bootstrap baseline generation to `docs/map/`.
- 2026-04-02 18:53-03:00 - Updated tests to expect `docs/map/` and to assert
  that bootstrap leaves `.agents/wb/` empty and without `.active_session`.
- 2026-04-02 19:07-03:00 - Migrated canonical docs/specs and refreshed the
  compatibility `deep-code-analisys` skill references.
- 2026-04-02 19:18-03:00 - Regenerated the repository codemap under `docs/map/`
  and refreshed `.agents/arc/structure/`.
- 2026-04-02 19:30-03:00 - Passed downstream full/partial bootstrap proof with
  `docs/map/` in the target repos and no exported workbench history.
