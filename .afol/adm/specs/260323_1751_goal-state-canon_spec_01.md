---
doc_type: spec
id: 260323_1751_goal-state-canon_spec_01
status: superseded
superseded_by: 260521_0000_total-reformulation-strategy_spec_01
superseded_note: "Superseded by the total reformulation strategy (260521_0000); its concerns were redesigned into the F-01..F-18 feature set, specifically replaced by F-18 adm/pstr onion architecture (goal-state canon moved to .afol/adm)."
owners:
- orchestrator
created_at: '2026-03-23T20:56:56Z'
updated_at: '2026-06-14T00:00:00+00:00'
roadmap_feature: F-11
spec_role: child
parent_spec: 260323_1741_current-state-maps-and-goal-state-governance_spec_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  plan: ''
  task: ''
  report: ''
scope:
  repo_areas:
  - docs/arc
  - docs
  - .afol/wb
  packages:
  - architecture-docs
  - roadmap-governance
  - spec-governance
  - project-brief
  - tech-stack
  - adr
risk_level: medium
---

# SPEC: goal-state-canon

## 1) Feature Intent

- Define the canonical goal-state document set that stays outside `docs/map/` and carries strategic, normative, and approval-level meaning.
- Keep desired-state documentation separate from current-state evidence so architecture and planning stay stable even as repository state changes.
- Roadmap feature: `F-11`
- Role of this spec: child

## 2) Problem

- The scaffold already separates roadmap/spec/workbench from runtime execution, but it does not yet spell out which goal-state docs are the authoritative sources for intent.
- Without a clear canon, strategic docs can absorb current-state inventories, scan output, or implementation snapshots and become noisy or stale.
- Downstream repos need a rule that says where intent lives and what must never be copied into that layer from `docs/map/`.

## 3) Users and User Journey

Primary users:

- scaffold maintainers defining documentation architecture
- downstream project maintainers reading the repo for intended direction
- agents that need to distinguish evidence from approved intent

User journey:

1. An operator wants to understand what the project is trying to become.
2. The operator reads goal-state docs outside `docs/map/` for the approved target architecture, roadmap, and decision history.
3. The operator uses `docs/map/` only as evidence when checking current implementation state.
4. A workstream links current-state findings back into spec and roadmap language without turning those docs into dumps of raw state.

Failure or friction points:

- Goal-state docs start repeating inventories, directory listings, or codemap output -> they become hard to maintain and lose authority.
- Current-state maps get promoted into normative docs -> operators confuse observation with decision.

## 4) Experience and Behavior

- Expected behavior:
  - `PROJECT-BRIEF.md` stays the canonical statement of product framing, audience, and problem space.
  - `ARCHITECTURE.md` stays the canonical statement of desired system shape, boundaries, and major design rules.
  - `TECH-STACK.md` stays the canonical statement of approved stack choices, supported versions, and platform assumptions.
  - `GENERAL-ROADMAP.md` stays the canonical statement of priorities, sequencing, and goal-state delivery intent.
  - `docs/arc/SPECS/` stores normative feature contracts that define intended change, not current implementation inventory.
  - ADRs stay the canonical record of irreversible decisions and rationale.
  - `docs/map/` may be cited as evidence, but not as the authority for these documents.
- Boundaries:
  - goal-state docs may summarize current conditions only at the level needed to explain the gap
  - goal-state docs must not embed raw scans, live file trees, generated dependency graphs, or command transcripts
  - current-state evidence belongs in `docs/map/` or workbench artifacts, not in the normative canon

## 5) Scope

In scope:

- the list of doc classes that make up goal-state canon
- the relationship between project brief, architecture, roadmap, specs, tech stack, and ADRs
- rules preventing current-state noise from leaking into those docs
- guidance for how workstreams should cite evidence without converting evidence into canon

Out of scope:

- defining the full `docs/map/` artifact contract
- implementing map generation or refresh automation
- changing the existing roadmap/spec/workbench lifecycle

## 6) Child Spec Strategy

- Child specs required: no
- Planned child specs:
  - none

## 7) Constraints and Assumptions

- Assumptions:
  - `docs/arc` remains the canonical home for project strategy and governance.
  - current-state data is more volatile than goal-state documentation and should therefore be isolated from strategic prose.
- Constraints:
  - no second governance tree may be introduced
  - goal-state docs must remain readable without consulting generated maps first
  - strategic docs must be reviewable as stable, intentional artifacts

## 8) Acceptance

- Success looks like:
  - operators can identify the authoritative docs for intent without reading `docs/map/`
  - goal-state docs stay concise and decision-oriented even when current-state evidence changes
  - current-state maps can change frequently without forcing edits to roadmap, architecture, or ADRs unless the actual intent changed
- Review questions:
  - Does each doc class have a single purpose?
  - Are current-state details excluded unless they are needed to justify a gap or decision?

## 9) Risks and Tradeoffs

- Risk: maintainers place current inventories into strategic docs because they are convenient -> Mitigation: define explicit anti-noise rules and evidence boundaries.
- Risk: docs become too abstract and stop helping implementers -> Mitigation: allow brief gap summaries, but keep raw evidence elsewhere.
- Tradeoff: separating canon from evidence adds one more reading step -> Why accepted: it prevents staleness and authority drift.

## 10) Rollout and Lifecycle

- Rollout approach:
  - define the canonical document classes first
  - then update repo guidance and templates to keep each class pure
  - finally teach workstreams how to cite evidence from `docs/map/` without copying it into goal-state docs
- Workstream linkage:
  - execution docs must reference `roadmap_feature` and `parent_spec`
  - goal-state canon stays the source of intent unless a new decision changes it
- Backout or deferral:
  - if a repo cannot separate the surfaces yet, keep the existing docs but avoid adding more current-state material to them

## 11) Verification Philosophy

- Evidence expected from delivery:
  - repository guidance that names the goal-state canon explicitly
  - specs and roadmap entries that stay free of generated current-state dumps
  - workbench evidence showing maps are used as inputs, not as authority
- Open questions:
  - Q-01 Which goal-state docs should be mandatory in every repo versus optional by maturity?
  - Q-02 What minimal format should ADRs and architecture docs follow so they remain stable and reviewable?

## 12) Acceptance Checklist

- User journey is explicit.
- Scope and non-goals are explicit.
- Child-spec policy is defined.
- Constraints and risks are explicit.
- Goal-state canon is separated from current-state evidence.
