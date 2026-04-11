---
doc_type: spec
id: 260306_2002_execution-intelligence-system_spec_01
theme: execution-intelligence-system
status: draft
owners:
- orchestrator
created_at: '2026-03-06T20:02:07-03:00'
updated_at: '2026-03-06T20:34:07-03:00'
roadmap_feature: F-07
spec_role: workstream
parent_spec: 260306_execution-intelligence-and-knowledge-system_spec_01
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260306_2002_execution-intelligence-system_plan_01
  task: 260306_2002_execution-intelligence-system_task_01
  report: 260306_2002_execution-intelligence-system_report_01
scope:
  repo_areas:
  - .agents/arc
  - .agents/a-docs
  - .agents/scripts
  - .agents/wb
  - AGENTS.md
  - README.md
  packages:
  - planning rigor
  - knowledge reuse
  - session closure
risk_level: medium
---

# SPEC: execution-intelligence-system

## 1) Feature Intent
- Outcome: The scaffold gains enforceable planning gates, reusable research discovery, recursive session-pack support, and postmortem-based closure.
- Why now: The roadmap-first layer is already in place; execution quality and token efficiency are now the limiting factors.
- Roadmap feature: `F-07`
- Role of this spec: workstream refinement

## 2) Problem
- Planning can complete without proving the repo was inspected.
- Prior findings are hard to reuse, which wastes tokens and increases repeated exploration.
- Flat session-only assumptions block clean multi-track work inside one session.
- Final session closure has no mandatory postmortem.

## 3) Users and User Journey
Primary users:
- agents working inside scaffolded repos
- maintainers reviewing whether execution quality is trustworthy

User journey:
1. Start a major governed workstream.
2. Read or search prior findings before broad repo exploration.
3. Complete brainstorm and explorer-check artifacts.
4. Execute work with recursive session-aware tooling.
5. Close the session only after a finalized postmortem exists.

Failure or friction points:
- Missing planning artifacts -> strict verification or closure should fail.
- Pack folders exist but tools ignore them -> tooling must recurse.

## 4) Experience and Behavior
- Expected behavior:
  - New major workstreams create brainstorm, research, explorer-check, and postmortem docs by default.
  - Knowledge tooling returns concise, reusable hits.
- Boundaries:
  - Do not require heavy external search infrastructure.
  - Do not break existing flat sessions.

## 5) Scope
In scope:
  - templates, validators, workbench automation, and knowledge search
  - roadmap/spec documentation for the new execution-intelligence model

Out of scope:
  - external databases
  - global machine memories

## 6) Child Spec Strategy
- Child specs required: <yes/no>
- Child specs required: yes
- Decomposition rule:
  - Split by planning gates, knowledge reuse, and session structure/closure because each has different enforcement surfaces.
- Planned child specs:
  - `260306_planning-rigor-and-explorer-gates_spec_01`
  - `260306_knowledge-reuse-and-token-efficiency_spec_01`
  - `260306_session-pack-structure-and-postmortem_spec_01`

## 7) Constraints and Assumptions
- Assumptions:
  - lightweight markdown indexing is enough for useful knowledge reuse
- Constraints:
  - Compatibility: keep flat sessions working
  - Operational: keep outputs concise to reduce token waste
  - Security/privacy: do not introduce new secret-bearing stores

## 8) Acceptance
- Success looks like:
  - the scaffold makes planning quality and closure discipline enforceable
  - agents can quickly find prior useful information without broad rereads
- Review questions:
  - Does this spec explain the feature without code?
  - Can an executor understand the user journey from this document alone?

## 9) Risks and Tradeoffs
- Risk: more workflow steps for major work -> Mitigation: keep quick mode exempt.
- Tradeoff: more artifacts per major workstream -> Why accepted: they replace repeated re-discovery and improve auditability.

## 10) Rollout and Lifecycle
- Rollout approach:
  - ship templates and docs first, then enforce through scripts and verification in the same change set
- Workstream linkage:
  - Execution must reference `roadmap_feature` and `parent_spec`
- Backout or deferral:
  - keep flat sessions and optional pack usage if adoption friction is too high

## 11) Verification Philosophy
- Evidence expected from delivery:
  - passing script tests covering new workflow gates
  - passing doctor/lint/full validation
- Open questions:
  - Q-01 Should knowledge search later add tags or summaries per feature id?
  - Q-02 Should pack folders eventually become the default for large sessions?

## 12) Acceptance Checklist
- [ ] User journey is explicit
- [ ] Scope and non-goals are explicit
- [ ] Child-spec policy is defined
- [ ] Constraints and risks are explicit
- [ ] Feature intent is understandable without implementation detail

---
*Template: `.agents/a-docs/templates/spec.md`*
