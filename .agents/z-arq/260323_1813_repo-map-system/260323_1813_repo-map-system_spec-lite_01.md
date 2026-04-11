---
doc_type: spec-lite
id: 260323_1813_repo-map-system_spec-lite_01
theme: repo-map-system
status: final
owners:
- orchestrator
created_at: '2026-03-23T18:13:06-03:00'
updated_at: '2026-03-23T18:30:47-03:00'
roadmap_feature: F-11
spec_role: workstream
parent_spec: 260323_1741_current-state-maps-and-goal-state-governance_spec_01
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  task: 260323_1813_repo-map-system_task_01
risk_level: low
---

# SPEC LITE: repo-map-system

## Intent
- Outcome: the scaffold exposes a first-class repository codemap command and standard so `.agents/arc/map/` becomes a durable, reproducible current-state mapping surface.
- Roadmap feature: `F-11`
- Parent spec: `260323_1741_current-state-maps-and-goal-state-governance_spec_01`

## Why Lite Is Enough
- The parent and child specs already define the philosophy and boundaries for current-state maps.
- This workstream is localized implementation of one command/docs/testing package inside the existing child spec.

## User or Operator Impact
- Primary affected user: scaffold maintainers and downstream operators
- Expected change in experience or behavior:
  - Operators can run one canonical command to refresh the full repository map instead of stitching together manual shell steps.

## Boundaries
- In scope:
  - wrapper command, config, docs, tests, and initial map generation for this repo
- Out of scope:
  - reimplementing OpenCode's whole multi-agent orchestrator
  - turning `arc/map/` into a governance surface

## Risks
- external runner missing or failing -> mitigation: make the dependency explicit, support dry-run, and validate generated outputs

## Acceptance
- [x] Intent is clear without code
- [x] Scope boundaries are explicit
- [x] Linked parent spec remains the source of full feature philosophy
- [x] Delivery evidence recorded in the report before session closure

---
*Template: `.agents/a-docs/templates/spec-lite.md`*
