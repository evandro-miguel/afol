---
doc_type: spec-lite
id: 260323_1743_current-state-map-goal-state-governance_spec-lite_01
theme: current-state-map-goal-state-governance
status: final
owners:
- orchestrator
created_at: '2026-03-23T17:43:56-03:00'
updated_at: '2026-03-23T17:47:51-03:00'
roadmap_feature: F-11
spec_role: workstream
parent_spec: 260323_1741_current-state-maps-and-goal-state-governance_spec_01
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  task: 260323_1743_current-state-map-goal-state-governance_task_01
risk_level: low
---

# SPEC LITE: current-state-map-goal-state-governance

## Intent
- Outcome: this session leaves behind a governed planning package for F-11 that formalizes the desired split between current-state maps and goal-state governance without changing the scaffold's existing planning or verification system.
- Roadmap feature: `F-11`
- Parent spec: `260323_1741_current-state-maps-and-goal-state-governance_spec_01`

## Why Lite Is Enough
- This session is limited to feature framing, repo-grounded exploration, and plan creation.
- The heavy design and implementation work should happen later through child specs and follow-up workstreams, so a local workstream refinement is enough here.

## User or Operator Impact
- Primary affected user: scaffold maintainers and downstream project maintainers
- Expected change in experience or behavior:
  - They get a plan that separates "what the repo currently is" from "what the scaffold intends the repo to become" without mixing those layers.

## Boundaries
- In scope:
  - Open the feature in roadmap/spec governance.
  - Create a workbench session with brainstorm, explorer-check, research, and plan.
  - Define the desired semantic split between `arc/map/` and the goal-state canon outside it.
- Out of scope:
  - Implementing the final `arc/map/` contract.
  - Updating bootstrap, status, or docs beyond what is needed to frame the plan.

## Risks
- Accidentally redefining roadmap/spec/workbench authority -> Mitigation: explicitly keep those layers canonical in the plan and spec.
- Treating `arc/map/` as a second planning surface -> Mitigation: define it as descriptive current-state evidence only.

## Acceptance
- [x] Intent is clear without code
- [x] Scope boundaries are explicit
- [x] Linked parent spec remains the source of full feature philosophy
- [x] Delivery evidence will be recorded in the report

---
*Template: `.agents/a-docs/templates/spec-lite.md`*
