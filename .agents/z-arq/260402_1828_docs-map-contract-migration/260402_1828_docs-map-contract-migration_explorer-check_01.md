---
doc_type: explorer-check
id: 260402_1828_docs-map-contract-migration_explorer-check_01
theme: docs-map-contract-migration
status: final
created_at: '2026-04-02T18:28:00-03:00'
updated_at: '2026-04-02T18:40:18-03:00'
roadmap_feature: F-11
parent_spec: 260323_1741_current-state-maps-and-goal-state-governance_spec_01
child_spec: 260323_1750_current-state-map-contract_spec_01
---

# Explorer Check: docs-map-contract-migration

- `rg` confirmed runtime defaults and docs still reference `.agents/arc/map/`
  in config, wrappers, bootstrap, standards, specs, and tests.
- Global MCP/router skills still mention `.agents/arc/map/`, so the scaffold
  contract must be migrated explicitly instead of assuming the skill layer
  already moved.
- `rag-docs verify_project_index` is fresh and `get_dead_code_report` found no
  meaningful dead code in the indexed project slice.
