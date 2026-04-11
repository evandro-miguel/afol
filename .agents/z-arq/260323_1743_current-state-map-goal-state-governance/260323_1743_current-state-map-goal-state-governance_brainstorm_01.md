---
doc_type: brainstorm
id: 260323_1743_current-state-map-goal-state-governance_brainstorm_01
theme: current-state-map-goal-state-governance
status: draft
roadmap_feature: F-11
parent_spec: 260323_1741_current-state-maps-and-goal-state-governance_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260323_1743_current-state-map-goal-state-governance_plan_01
created_at: '2026-03-23T17:43:56-03:00'
updated_at: '2026-03-23T17:47:51-03:00'
---

# Brainstorm: current-state-map-goal-state-governance

## Problem Statement
- The scaffold needs an explicit split between current-state project mapping and goal-state governance so downstream repos can use `.agents/arc/map/` without weakening roadmap/spec/workbench authority.
- The plan must preserve the existing production model for roadmap, parent specs, child specs, verification, and workbench sessions instead of introducing a parallel planning system.

## Repo Context to Validate
- Files/areas likely involved:
  - `.agents/arc/GENERAL-ROADMAP.md`
  - `.agents/arc/README.md`
  - `.agents/a-docs/specs/README.md`
  - `.agents/a-docs/standards/workflow.md`
  - `.agents/a-docs/standards/structure-map.md`
  - `.agents/arc/SPECS/260306_project-context-canon-and-setup_spec_01.md`
  - `.agents/arc/SPECS/260306_artifact-resolution-layer_spec_01.md`
- Existing patterns or constraints to confirm:
  - Roadmap, parent specs, and workstreams are already the canonical planning and verification system.
  - The scaffold explicitly avoids creating a second governance tree.
  - Structure and map-like docs must stay descriptive, refreshable, and subordinate to strategic docs.

## Assumptions
- `.agents/arc/map/` should become the canonical home for current-state, descriptive repository maps.
- Goal-state docs should remain outside `arc/map/` and continue to govern desired architecture, roadmap, specs, and product direction.
- A new feature can formalize this taxonomy without rewriting the current roadmap-first delivery model.

## Options
1. Option A - Keep everything under `.agents/arc/` without defining a semantic boundary and rely on naming discipline only.
2. Option B - Introduce an explicit `arc/map/` current-state surface while keeping roadmap/spec/workbench and strategic docs outside that folder as the goal-state canon.
3. Option C - Treat `arc/map/` as the main project context and let roadmap/spec docs become secondary views over it.

## Tradeoffs
| Option | Pros | Cons | Risk | Complexity |
|--------|------|------|------|------------|
| A | Lowest immediate change | Leaves state-vs-goal ambiguity unresolved | Medium | low |
| B | Clear semantic split without replacing existing governance | Requires explicit docs and future command/bootstrap updates | Low | medium |
| C | Maximizes visibility of current repo state | Blurs evidence with intent and risks a second governance system | High | high |

## Preferred Direction
- Selected: Option B
- Why: It gives downstream projects a dedicated current-state surface while preserving the scaffold's existing roadmap/spec/workbench model as the goal-state and execution authority.
- Rejected options:
  - Option A -> keeps the current ambiguity and pushes the burden onto naming discipline alone.
  - Option C -> would mix descriptive state with strategic intent and conflict with the scaffold's existing governance philosophy.

## Decision Criteria
- Preserve roadmap-first governance and parent-spec authority.
- Make current-state evidence easier to find without elevating it to approval status.
- Keep the model understandable for downstream repos and bootstrap exports.
- Avoid inventing a second planning or verification system.

## Planning Readiness
- Ready for explorer-check: yes
- Unknowns that must be verified against the current repo:
  - Whether current docs already define enough of the state-vs-goal split to avoid a new feature.
  - Which existing docs already imply "current state" versus "desired state" semantics.
  - Whether `arc/map/` needs to be mandatory or merely supported by contract.
- Knowledge to reuse before planning:
  - `./.agents/agents knowledge search "current state desired state roadmap specs architecture map"`
  - `./.agents/agents knowledge pull "bootstrap generic project state roadmap spec backlog"`
  - `./.agents/agents knowledge pull "context canon roadmap specs workbench"`

---
*Template: `.agents/a-docs/templates/brainstorm.md`*
