---
doc_type: plan
id: 260323_1743_current-state-map-goal-state-governance_plan_01
theme: current-state-map-goal-state-governance
status: final
owners:
- orchestrator
created_at: '2026-03-23T17:43:56-03:00'
updated_at: '2026-03-23T17:47:51-03:00'
roadmap_feature: F-11
parent_spec: 260323_1741_current-state-maps-and-goal-state-governance_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  brainstorm: 260323_1743_current-state-map-goal-state-governance_brainstorm_01
  explorer_check: 260323_1743_current-state-map-goal-state-governance_explorer-check_01
  research: 260323_1743_current-state-map-goal-state-governance_research_01
  task: 260323_1743_current-state-map-goal-state-governance_task_01
repo: agentic_start_folder
branch: main
---

# Plan: current-state-map-goal-state-governance

## Objective
- Deliver work for roadmap feature `F-11` within the boundaries defined by parent spec `260323_1741_current-state-maps-and-goal-state-governance_spec_01`.

## Scope
- In scope:
  - Define the planning package for a current-state vs goal-state documentation split in the scaffold.
  - Keep roadmap, parent specs, child specs, verification, and workbench semantics intact.
  - Define where `arc/map/` fits as a descriptive current-state surface.
  - Identify the follow-up tracks needed for docs, bootstrap, and command integration.
- Out of scope:
  - Replacing the existing roadmap/spec/workbench system.
  - Turning `arc/map/` into a second planning or approval surface.
  - Implementing every future map-generation workflow in this session.
  - Splitting execution by week; this plan should stay feature- and artifact-oriented.

## Governance Context
- Roadmap feature: `F-11`
- Parent spec: `260323_1741_current-state-maps-and-goal-state-governance_spec_01`
- Child spec: ``
- Planning rule:
  - Do not redefine feature philosophy here; use this file to plan execution of already-defined intent.
  - A major plan is not complete until brainstorm and explorer-check artifacts exist and are linked here.

## Planning Inputs
- Brainstorm artifact: `260323_1743_current-state-map-goal-state-governance_brainstorm_01`
- Explorer check artifact: `260323_1743_current-state-map-goal-state-governance_explorer-check_01`
- Research artifact: `260323_1743_current-state-map-goal-state-governance_research_01`
- Knowledge lookup performed:
  - `./.agents/agents knowledge search "current state desired state roadmap specs architecture map"` -> no reusable matches.
  - `./.agents/agents knowledge pull "bootstrap generic project state roadmap spec backlog"` -> no reusable digest.
  - `./.agents/agents knowledge pull "context canon roadmap specs workbench"` -> no reusable digest.
  - Direct repo inspection of roadmap/spec/workflow/structure docs was required.

## Success Criteria
- The plan defines `arc/map/` as current-state/descriptive only and keeps desired-state governance outside that folder.
- The plan preserves the current roadmap -> parent spec -> workstream model without introducing a second planning system.
- The plan identifies the concrete follow-up tracks needed to adopt the split in docs, bootstrap, and command surfaces.
- The plan is grounded in existing scaffold standards rather than imported assumptions from external systems.

## Delivery Strategy
1. Define the taxonomy: current-state evidence in `arc/map/` versus goal-state canon in the rest of `.agents/arc/`.
2. Define the goal-state surfaces that remain authoritative outside `arc/map/`, including desired architecture, roadmap, specs, and related strategic docs.
3. Define how workstreams, review flows, and status/resolver logic should consume current-state maps without promoting them to governance sources.
4. Define the downstream adoption path for docs, bootstrap, and future map-generation workflows.

## Critical Dependencies
- Tools:
  - `./.agents/agents knowledge`
  - `./.agents/agents new`
  - `./.agents/agents index`
  - `make doctor`
  - `make lint`
- MCPs:
  - none
- Skills:
  - `writing-skills`
  - `markdownlint-skill`
  - `agentic-system-workflow`
- Executor instruction:
  - Preserve the current production model. Treat `arc/map/` as descriptive evidence only; keep roadmap/spec/workbench as the planning and verification system.

## Large Plan Handling
- If this plan exceeds 500 lines, split into phases.
- Create one task file per phase.

## Risks and Mitigations
- Risk: `arc/map/` becomes a second governance tree -> Mitigation: make roadmap/spec/workbench authority explicit in every follow-up artifact.
- Risk: maintainers duplicate architecture intent inside and outside `arc/map/` -> Mitigation: define document classes and ownership clearly.
- Risk: bootstrap leaks live current-state artifacts into fresh repos -> Mitigation: keep bootstrap generic and explain when `arc/map/` is optional, empty, or generated.
- Risk: command/status flows start resolving map docs as canonical approval sources -> Mitigation: scope resolver and status integration to evidence consumption only.

## Verification Plan
- Unit: `N/A`
- E2E: `N/A`
- Typecheck: `N/A`
- Lint: `make lint`
- Other checks:
  - `make doctor` -> prove structure and document integrity remain valid after adding the new feature and session
  - `./.agents/agents index` -> prove spec indexes remain in sync after adding the parent spec
  - Manual review -> prove the new plan does not mix governance layers and respects the current production model

## Completion Gate
- [x] Brainstorm exists and reflects real option analysis
- [x] Explorer check proves current-project inspection happened
- [x] Relevant prior knowledge was searched or explicitly ruled out
- [x] Verification path is concrete enough to execute without guesswork

---
*Template: `.agents/a-docs/templates/plan.md`*
