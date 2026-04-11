---
doc_type: spec-lite
id: 260402_1858_project-docs-root-migration_spec-lite_01
theme: project-docs-root-migration
status: final
owners:
- orchestrator
created_at: '2026-04-02T18:58:13-03:00'
updated_at: '2026-04-02T20:36:36-03:00'
roadmap_feature: F-11
spec_role: workstream
parent_spec: 260323_1741_current-state-maps-and-goal-state-governance_spec_01
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  task: 260402_1858_project-docs-root-migration_task_01
risk_level: low
---

# SPEC LITE: project-docs-root-migration

## Intent
- Outcome: project-facing documentation lives under `docs/`, while `.agents/` stays reserved for runtime/workbench/skills state.
- Roadmap feature: `F-11`
- Parent spec: `260323_1741_current-state-maps-and-goal-state-governance_spec_01`

## Why Lite Is Enough
- The change is large in path surface but localized in behavior: it is a contract migration, not a redesign of the workflow model.
- The governing philosophy already exists in the parent spec; this slice only needed execution-level migration and proof.

## User or Operator Impact
- Primary affected user: repository operators and interactive CLI agents adopting this scaffold
- Expected change in experience or behavior:
  - project docs are found under `docs/`
  - bootstrap emits downstream project docs into `docs/`
  - `.agents/` is simpler and agent-runtime-specific

## Boundaries
- In scope:
  - path migration to `docs/` for project canon
  - bootstrap/runtime/test/doc alignment
- Out of scope:
  - changing workbench semantics under `.agents/wb/`
  - redesigning skills-sync beyond path alignment

## Risks
- stale generated docs -> rerun `make structure`, `make index`, `make knowledge-index`, and `make repo-map`
- hidden path assumptions -> inventory with `rg` and prove with `make all`

## Acceptance
- [x] Intent is clear without code
- [x] Scope boundaries are explicit
- [x] Linked parent spec remains the source of full feature philosophy
- [x] Delivery evidence will be recorded in the report

---
*Template: `docs/templates/spec-lite.md`*
