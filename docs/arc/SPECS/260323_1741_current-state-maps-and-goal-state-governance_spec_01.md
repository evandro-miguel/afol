---
doc_type: spec
id: 260323_1741_current-state-maps-and-goal-state-governance_spec_01
theme: current-state-maps-and-goal-state-governance
status: active
owners:
- orchestrator
created_at: '2026-03-23T20:41:35Z'
updated_at: '2026-03-23T18:06:19-03:00'
roadmap_feature: F-11
spec_role: parent
parent_spec: ''
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  plan: ''
  task: ''
  report: ''
scope:
  repo_areas:
  - docs/arc
  - docs
  - .agents/scripts
  - .agents/wb
  packages:
  - architecture-docs
  - roadmap-governance
  - structure-maps
  - bootstrap
risk_level: medium
---

# SPEC: current-state-maps-and-goal-state-governance

## 1) Feature Intent

- Outcome: the scaffold defines a clear semantic split between current-state project maps and goal-state governance documents so operators can read the repo accurately without blurring evidence and intent.
- Why now: downstream repos increasingly need richer map surfaces under `docs/map/`, but the scaffold does not yet define how those artifacts relate to roadmap, specs, architecture, and workbench planning.
- Roadmap feature: `F-11`
- Role of this spec: parent

## 2) Problem

- The scaffold already has roadmap/spec/workbench governance and structure-map documentation, but it does not explicitly distinguish descriptive current-state artifacts from desired-state planning artifacts.
- Without an explicit contract, operators may read generated or observational maps as if they were roadmap/spec decisions, or may overload strategic docs with current-state detail that goes stale quickly.
- The lack of this boundary becomes more expensive as codemap and architecture-analysis outputs grow across downstream repos.

## 3) Users and User Journey

Primary users:

- scaffold maintainers evolving the documentation model
- downstream project maintainers adopting the scaffold
- operators and agents trying to understand current repo state before executing governed work

User journey:

1. An operator needs to understand how the current repository is structured and what exists today.
2. The operator reads `docs/map/` for descriptive current-state evidence and current technical surfaces.
3. The operator reads `PROJECT-BRIEF.md`, `ARCHITECTURE.md`, `TECH-STACK.md`, `GENERAL-ROADMAP.md`, and `SPECS/` for desired-state intent and approved goals.
4. A workstream references roadmap/specs for execution authority and may cite `docs/map/` only as input evidence.

Failure or friction points:

- Current-state map artifacts drift or go stale -> they should remain descriptive and refreshable, not governance sources.
- Goal-state docs absorb too much current-state detail -> they become noisy and harder to maintain as the product philosophy layer.

## 4) Experience and Behavior

- Expected behavior:
  - `docs/map/` is reserved for current-state, descriptive, evidence-heavy artifacts.
  - Goal-state docs remain outside `docs/map/` and continue to define product intent, architecture direction, roadmap features, and spec boundaries.
  - Workstreams may inspect `docs/map/` during brainstorm, explorer-check, research, review, and status flows, but must still link to roadmap/spec governance for approved intent.
  - Bootstrap and docs explain the split without creating a parallel planning tree.
- Boundaries:
  - This feature does not replace roadmap/spec/workbench governance.
  - This feature does not require every project to generate the full `docs/map/` surface immediately.

## 5) Scope

In scope:

- the document taxonomy for current-state vs goal-state artifacts
- semantic boundaries for `docs/map/` and the rest of `docs/arc/`
- guidance for how workstreams and runtime commands consume map artifacts
- bootstrap and documentation implications for the new split

Out of scope:

- implementing every map-generation workflow
- replacing existing roadmap/spec/workbench verification rules
- moving execution evidence out of the workbench

## 6) Child Spec Strategy

- Child specs required: yes
- Decomposition rule:
  - create child specs when implementation splits into independent tracks for map contract, goal-state canon, and command/bootstrap integration
- Child specs:
  - `260323_1750_current-state-map-contract_spec_01` -> define required/optional `docs/map/` surfaces and ownership
  - `260323_1751_goal-state-canon_spec_01` -> define which docs outside `docs/map/` remain strategic and normative
  - `260323_1752_workflow-and-bootstrap-integration_spec_01` -> define command/docs/bootstrap behavior for the split

## 7) Constraints and Assumptions

- Assumptions:
  - `docs/arc` remains the canonical home for strategic project context.
  - `docs/map/` artifacts may be partially generated, partially curated, and more refreshable than roadmap/spec docs.
- Constraints:
  - Compatibility: the new split must not break the current roadmap/spec/workbench operating model
  - Operational: no second governance tree may be introduced
  - Security/privacy: map artifacts must obey the same secret-free and project-safe rules as other committed docs

## 8) Acceptance

- Success looks like:
  - Operators can answer "where do I look for current state?" and "where do I look for intended state?" without ambiguity.
  - Downstream projects can adopt `docs/map/` without weakening roadmap-first governance.
  - Workstreams can cite current-state maps as evidence while still treating roadmap/specs as the source of execution authority.
- Review questions:
  - Does this spec keep descriptive evidence separate from product intent?
  - Can a downstream maintainer understand the split without reading implementation code?

## 9) Risks and Tradeoffs

- Risk: current-state maps drift and become misleading -> Mitigation: define them as descriptive and refreshable, never as approval sources.
- Risk: maintainers create duplicate architecture docs inside and outside `docs/map/` -> Mitigation: define clear boundaries and ownership per doc class.
- Tradeoff: the documentation model becomes more explicit and slightly heavier -> Why accepted: it prevents state/goal confusion in larger downstream repos.

## 10) Rollout and Lifecycle

- Rollout approach:
  - define the taxonomy and naming contract first
  - then update docs, bootstrap guidance, and command expectations
- Workstream linkage:
  - Execution must reference `roadmap_feature` and `parent_spec`
- Backout or deferral:
  - projects can continue without `docs/map/` until the contract and tooling are ready, but must preserve the goal-state canon outside that folder

## 11) Verification Philosophy

- Evidence expected from delivery:
  - roadmap/spec/docs updates that explain the split clearly
  - workbench plan/report evidence showing the model can be used without mixing governance layers
- Open questions:
  - Q-01 Answered: bootstrap must create `docs/map/README.md` as the mandatory
    current-state entrypoint, while detailed codemap/API/dependency artifacts
    remain optional and refreshable on demand.
  - Q-02 Answered: bootstrap should teach the boundary and create the empty map
    surface; full map generation remains a downstream adoption or explicit
    `repo-map` workflow.

## 12) Acceptance Checklist

- User journey is explicit.
- Scope and non-goals are explicit.
- Child-spec policy is defined.
- Constraints and risks are explicit.
- Feature intent is understandable without implementation detail.
