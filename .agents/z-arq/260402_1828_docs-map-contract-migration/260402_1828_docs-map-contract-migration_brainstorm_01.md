---
doc_type: brainstorm
id: 260402_1828_docs-map-contract-migration_brainstorm_01
theme: docs-map-contract-migration
status: final
created_at: '2026-04-02T18:28:00-03:00'
updated_at: '2026-04-02T18:40:18-03:00'
roadmap_feature: F-11
parent_spec: 260323_1741_current-state-maps-and-goal-state-governance_spec_01
child_spec: 260323_1750_current-state-map-contract_spec_01
---

# Brainstorm: docs-map-contract-migration

- Current-state map artifacts should move to `docs/map/` so they live at the
  project root and remain clearly separate from `.agents/arc/` governance and
  `.agents/wb/` execution.
- The migration must update both human-facing docs and machine defaults, or the
  old path will keep reappearing through bootstrap and wrapper help.
- Bootstrap should copy only reusable scaffold surfaces; local workbench runs
  and source-repo execution history must stay behind.
