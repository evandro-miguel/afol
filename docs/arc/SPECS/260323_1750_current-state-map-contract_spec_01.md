---
doc_type: spec
id: 260323_1750_current-state-map-contract_spec_01
theme: current-state-map-contract
status: active
owners:
- orchestrator
created_at: '2026-03-23T20:50:00Z'
updated_at: '2026-03-23T20:50:00Z'
roadmap_feature: F-11
spec_role: child
parent_spec: 260323_1741_current-state-maps-and-goal-state-governance_spec_01
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  plan: ''
  task: ''
  report: ''
scope:
  repo_areas:
  - docs/map
  - docs/arc
  - docs
  - .agents/scripts
  - .agents/wb
  packages:
  - structure-maps
  - architecture-docs
  - roadmap-governance
risk_level: medium
---

# SPEC: current-state-map-contract

## 1) Feature Intent

- Outcome: the scaffold defines the contract for `docs/map/` as a descriptive current-state surface for repository maps and analysis evidence.
- Why now: downstream repos need a place for current-state maps, but that surface must not become a second governance tree or compete with roadmap/spec/workbench authority.
- Roadmap feature: `F-11`
- Role of this spec: child

## 2) Problem

- The scaffold already has roadmap-first governance, workbench execution, and strategic docs for desired state.
- It does not yet define which map-like artifacts belong to `docs/map/`, how they are owned, or how often they are refreshed.
- Without a contract, current-state maps can drift into strategic docs or be mistaken for approval sources.

## 3) Users and User Journey

Primary users:

- scaffold maintainers
- downstream project maintainers
- operators and agents inspecting the current repo state

User journey:

1. A maintainer generates or curates current-state repository maps.
2. The maintainer stores those artifacts under `docs/map/` as descriptive evidence.
3. Agents use those maps during discovery, brainstorm, explorer-check, and review flows.
4. Roadmap, specs, and workbench artifacts remain the authoritative source for approved intent and execution.

Failure or friction points:

- Map artifacts are missing -> the plan should still work, but the current-state surface is incomplete.
- Maps drift or become stale -> the contract must require refreshable, evidence-oriented handling rather than approval semantics.

## 4) Experience and Behavior

- Expected behavior:
  - `docs/map/` is descriptive, refreshable, and non-governance.
  - Map artifacts may include file inventories, dependency graphs, hotspots, symbol summaries, architecture snapshots, and related evidence.
  - The contract distinguishes current-state evidence from goal-state docs such as roadmap, specs, project brief, architecture, and tech stack.
  - Workstreams may cite `docs/map/` as input evidence, but they must not treat it as the source of execution authority.
- Boundaries:
  - This spec does not redefine roadmap/spec/workbench governance.
  - This spec does not require every repo to generate the full map surface immediately.

## 5) Scope

In scope:

- likely `docs/map/` artifact families and their purpose
- ownership and refresh expectations for map outputs
- boundaries between descriptive map evidence and strategic goal-state docs
- consumption rules for workstreams and runtime commands

Out of scope:

- building the full map-generation pipeline
- changing roadmap/spec/workbench file formats
- making `docs/map/` a required approval gate

## 6) Child Spec Strategy

- Child specs required: no
- Decomposition rule:
  - split further only if implementation work separates into independent map-generation, refresh, or indexing tracks
- Planned child specs:
  - none

## 7) Constraints and Assumptions

- Assumptions:
  - `docs/map/` is project-specific and may vary by repository maturity.
  - Existing roadmap/spec/workbench semantics remain canonical.
- Constraints:
  - Compatibility: map artifacts must not break current planning or verification flows
  - Operational: refresh expectations must be explicit but not overly rigid
  - Security/privacy: map outputs must remain secret-free and safe to commit

## 8) Acceptance

- Success looks like:
  - Maintainers can tell which artifacts belong in `docs/map/` without guessing.
  - Agents can read current-state evidence from `docs/map/` without treating it as approval authority.
  - Goal-state docs outside `docs/map/` remain the canonical place for roadmap, specs, and architecture intent.
- Review questions:
  - Does this spec keep current-state evidence separate from governance?
  - Can a downstream maintainer apply the contract without reading implementation code?

## 9) Risks and Tradeoffs

- Risk: `docs/map/` becomes stale and misleading -> Mitigation: define it as refreshable evidence, not authoritative intent.
- Risk: repos overproduce map artifacts and create noise -> Mitigation: keep the surface descriptive and purpose-driven.
- Tradeoff: the contract adds explicit boundaries -> Why accepted: it prevents state/goal confusion in larger repos.

## 10) Rollout and Lifecycle

- Rollout approach:
  - define the artifact contract first
  - then wire it into docs, bootstrap guidance, and any future command integration
- Workstream linkage:
  - Execution must reference `roadmap_feature` and `parent_spec`
- Backout or deferral:
  - if a repo is not ready for maps, the surface can stay absent without affecting roadmap/spec governance

## 11) Verification Philosophy

- Evidence expected from delivery:
  - documentation that names the `docs/map/` surface and its allowed artifact classes
  - workbench artifacts showing the surface is used as evidence, not governance
- Open questions:
  - Q-01 Which artifact types become standard across downstream repos?
  - Q-02 Which map files should be generated automatically versus curated manually?

## 12) Acceptance Checklist

- User journey is explicit.
- Scope and non-goals are explicit.
- Child-spec policy is defined.
- Constraints and risks are explicit.
- Feature intent is understandable without implementation detail.
