---
doc_type: spec-child
id: 260528_1723_map-boundary-cleanup_spec-child_01
theme: map-boundary-cleanup
status: final
owners:
- orchestrator
created_at: '2026-05-28T17:23:36-03:00'
updated_at: '2026-05-31T15:55:00-03:00'
roadmap_feature: F-15
spec_role: child
parent_spec: 260412_2004_repo-wide-simplification-runtime-parity_spec_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  parent: .afol/adm/specs/260412_2004_repo-wide-simplification-runtime-parity_spec_01.md
  plan: .afol/wb/260528_1723_map-boundary-cleanup/260528_1723_map-boundary-cleanup_plan_01.md
  task: .afol/wb/260528_1723_map-boundary-cleanup/260528_1723_map-boundary-cleanup_task_01.md
  report:
risk_level: low
---

# SPEC CHILD: map-boundary-cleanup

## Intent

- Outcome: `docs/map/` stays the current-state evidence surface,
  `docs/map/structure/` is treated as current-state evidence, and
  `docs/arc/structure/` is retired as a live destination.
- Roadmap feature: `F-15`
- Parent spec: `260412_2004_repo-wide-simplification-runtime-parity_spec_01`

## Canonical Position

- `spec-child` is the canonical child/local feature specification artifact.
- Use `spec-lite` only for historical compatibility during migration.

## Child Scope Rationale

- This slice is docs-only and exists to remove boundary drift between
  current-state evidence and goal-state governance.
- It stays separate from runtime or script simplification because the risk is
  wording and surface ownership, not code behavior.

## User or Operator Journey

1. An operator reads `docs/map/` as current-state evidence and `docs/arc/` as
   goal-state governance.
2. The operator uses `docs/map/structure/` as a current-state layout
   reference.
3. No doc points to `docs/arc/structure/` as a live current-state
   destination.

## Boundaries

- In scope:
  - `docs/arc/README.md`
  - `docs/arc/SPECS/INDEX.md`
  - `docs/map/README.md`
  - `docs/standards/repo-map.md`
  - `docs/standards/structure-map.md`
  - linked workbench plan/task artifacts for this session
- Out of scope:
  - `.agents/scripts/**`
  - runtime code, tests, benchmarks, flags, or CLI behavior
  - broad markdown cleanup outside the boundary wording touched by this slice

## Risks and Mitigations

- Risk: wording stays split across multiple docs -> Mitigation: update the
  central boundary docs and the spec index together.
- Risk: legacy path language remains ambiguous -> Mitigation: describe
  `docs/arc/structure/` only as retired/deprecated, never as a target.

## Acceptance

- [x] Child scope is explicit and bounded
- [x] Parent spec linkage is explicit
- [x] Journey is clear without code
- [x] Delivery evidence target is clear in linked report
- [x] `docs/map/structure/` is described as current-state evidence
- [x] `docs/arc/structure/` is described only as retired/deprecated

---

*Child spec: `docs/arc/SPECS/260528_1723_map-boundary-cleanup_spec-child_01.md`*
