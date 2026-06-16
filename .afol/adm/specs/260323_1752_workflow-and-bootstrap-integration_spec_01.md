---
doc_type: spec
id: 260323_1752_workflow-and-bootstrap-integration_spec_01
theme: workflow-and-bootstrap-integration
status: superseded
superseded_by: 260521_0000_total-reformulation-strategy_spec_01
superseded_note: "Superseded by the total reformulation strategy (260521_0000); its concerns were redesigned into the F-01..F-18 feature set, specifically replaced by F-18 adm/pstr onion architecture (bootstrap/workflow integration for state-vs-goal split)."
owners:
- orchestrator
created_at: '2026-03-23T21:02:00Z'
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
  - .agents/scripts
  - .afol/wb
  - AGENTS.md
  - README.md
  packages:
  - workflow-docs
  - bootstrap
  - roadmap-governance
risk_level: medium
---

# SPEC: workflow-and-bootstrap-integration

## 1) Feature Intent

- Outcome: project workflow, bootstrap, and runtime commands understand the current-state versus goal-state split without introducing a second governance tree.
- Why now: the scaffold already has roadmap/spec/workbench governance, but the behavior of bootstrap, status, review, and resolver commands does not yet explicitly reinforce the new taxonomy between `docs/map/` and goal-state docs.
- Roadmap feature: `F-11`
- Role of this spec: child

## 2) Problem

- The scaffold has enough structure for governed work, but operators can still receive generic workflow guidance that does not distinguish current-state evidence from goal-state intent.
- Without explicit command and bootstrap behavior, a downstream repo can accidentally create a parallel planning or governance surface alongside roadmap/spec/workbench artifacts.
- Status and review flows need to know when to point users at `docs/map/` for evidence and when to point them back to roadmap, specs, architecture, or the active workbench session.

## 3) Users and User Journey

Primary users:

- scaffold maintainers
- downstream maintainers adopting the state-vs-goal split
- operators using bootstrap, status, review, and resolver flows

User journey:

1. A maintainer bootstraps a fresh repo from the scaffold.
2. Bootstrap teaches the repo where current-state evidence belongs and where goal-state governance belongs.
3. An operator starts or resumes a workstream in the workbench.
4. Status and review commands surface the active session, the authoritative roadmap/spec links, and the current-state map location without inventing a separate planning tree.
5. Resolver behavior helps route questions to either `docs/map/` evidence or goal-state docs, depending on whether the user needs current state or intended state.

Failure or friction points:

- Bootstrap produces generic guidance that blurs evidence and intent -> operators create duplicate docs or read the wrong surface.
- Status output points at maps, roadmap, specs, and workbench without a clear priority order -> users lose the authority hierarchy.
- Review or resolver commands become a second governance tree -> the repo ends up with two competing sources of truth.

## 4) Experience and Behavior

- Expected behavior:
  - Bootstrap must describe the split in plain terms and tell the operator where current-state evidence lives versus where strategic intent lives.
  - Workbench sessions remain the place for execution narrative, while `docs/map/` remains evidence-only.
  - Status output should identify the active workbench session, the relevant parent spec or roadmap feature, and any current-state map artifacts that are useful for context.
  - Review output should evaluate whether the workstream stayed aligned with the roadmap/spec hierarchy and whether it avoided treating maps as approval sources.
  - Resolver behavior should route queries about "what exists now" to maps and queries about "what should happen" to roadmap/spec/architecture docs.
- Boundaries:
  - This spec does not redefine the map contract itself.
  - This spec does not replace the roadmap/spec/workbench model with a new planning system.
  - This spec does not require status or resolver commands to generate new documents when existing ones already answer the question.

## 5) Scope

In scope:

- bootstrap text and guidance for the state-vs-goal split
- command behavior for status, review, and resolver flows
- workbench usage rules that keep execution evidence separate from governance docs
- documentation updates that explain how to navigate the split without adding a second tree

Out of scope:

- designing the current-state map artifact family
- changing the roadmap or spec data model
- replacing workbench sessions with a new command-specific workflow

## 6) Child Spec Strategy

- Child specs required: no
- Decomposition rule:
  - split further only if bootstrap wiring, command routing, or workbench UX become independent implementation tracks
- Planned child specs:
  - none

## 7) Constraints and Assumptions

- Assumptions:
  - `docs/arc/GENERAL-ROADMAP.md` and `SPECS/` remain the canonical governance layer.
  - `.afol/wb/` remains the canonical place for execution artifacts.
  - `docs/map/` is evidence-oriented and may be absent in some repos until adopted.
- Constraints:
  - Compatibility: existing roadmap/spec/workbench semantics must keep working
  - Operational: bootstrap and runtime commands must not create a parallel governance tree
  - Security/privacy: command output and bootstrap guidance must stay secret-free and repo-safe

## 8) Proposed Solution

Summary:

- teach bootstrap how to explain the state-vs-goal split
- update command behavior so status, review, and resolver reinforce the existing governance hierarchy
- keep workbench as the execution surface and `docs/map/` as the evidence surface

Key design choices:

- `status` should summarize, not decide -> it points to the active session and the authoritative docs instead of inventing new structure
- `review` should validate alignment, not create intent -> it checks whether work stayed inside roadmap/spec/workbench authority
- `resolver` should route by question type -> current-state questions go to maps; goal-state questions go to roadmap/spec/architecture
- bootstrap should explain the hierarchy once and then reuse the same language across commands -> this keeps the model stable for downstream maintainers

## 9) Architecture Impact

Touched layers:

- bootstrap scripts and bootstrap docs
- workbench session guidance
- status/review/resolver command surfaces
- onboarding and repository-level README guidance

New components:

- no new governance component
- updated bootstrap guidance at `.agents/scripts` and `docs`

Dependency rules:

- Allowed deps: bootstrap -> docs -> command guidance -> workbench -> roadmap/specs
- Forbidden deps: bootstrap -> new planning tree
- Forbidden deps: status/review/resolver -> approval authority over `docs/map/`

## 10) Interfaces

APIs:

- Status: input = active repo/session context | output = current session, authoritative roadmap/spec links, current-state map pointers | errors = missing session or missing governance links
- Review: input = workstream artifacts and session context | output = alignment findings and gaps | errors = unresolved authority conflicts
- Resolver: input = operator question | output = route to map evidence or goal-state docs | errors = ambiguous intent requiring clarification

CLI or scripts:

- Command: bootstrap | Effect: explain the split and seed the repo with correct navigation expectations | Safety: must not generate duplicate governance docs
- Command: status | Effect: summarize active work without promoting maps to governance | Safety: read-only
- Command: review | Effect: check the workstream against roadmap/spec/workbench authority | Safety: read-only unless explicitly updating evidence
- Command: resolver | Effect: route questions to the right doc class | Safety: no writes

Events or jobs:

- Event: bootstrap-complete | Producer: scaffold bootstrap | Consumer: maintainers and runtime docs
- Event: workbench-status-requested | Producer: operator | Consumer: status command
- Event: review-requested | Producer: operator or automation | Consumer: review command

## 11) Data Model

Entities:

- session fields: id, theme, active, plan, task, log, report
- authority fields: roadmap_feature, parent_spec, current_state_docs, goal_state_docs
- route fields: question_type, target_surface, confidence, clarification_needed

Storage:

- Session folder: `.afol/wb/<session>/` key: session id
- Governance docs: `docs/arc/` key: roadmap feature and spec id
- Current-state evidence: `docs/map/` key: repo-specific artifact name

Migrations:

- no schema migration required
- documentation and command contract updates only

## 12) Flow

Happy path:

1. Bootstrap explains the repo has a current-state surface and a goal-state governance surface.
2. An operator starts a workbench session for implementation.
3. `status` shows the active session and the canonical governance links.
4. `review` checks that evidence stays in the workbench and maps stay descriptive.
5. `resolver` sends current-state questions to `docs/map/` and goal-state questions to roadmap/specs.

Error paths:

- E-01 Missing `docs/map/` surface -> bootstrap and status fall back to roadmap/spec/workbench guidance without fabricating a map tree
- E-02 Ambiguous query -> resolver asks for clarification instead of guessing a document class
- E-03 Duplicate governance language -> review flags the overlap and points back to the canonical hierarchy

## 13) Error Handling

- Error taxonomy: missing surface, ambiguous intent, duplicate authority, stale guidance
- Retries: clarify once, then route to the canonical doc class
- User messages: explain where the question belongs and avoid inventing new directories or workflows

## 14) Security and Privacy

- Secrets handling: bootstrap and command output must never echo secrets, tokens, or local credentials
- Permissions: read-only by default for status, review, and resolver flows
- Threats: accidental governance duplication -> mitigation: keep the command language anchored to roadmap/spec/workbench authority

## 15) Performance

Budgets:

- Latency: fast enough for interactive CLI use
- Memory: minimal, no heavy indexing required for the command split itself
- IO: prefer reading existing docs over generating new ones

Hot paths:

- status summary -> keep to a small, deterministic doc set
- resolver routing -> use clear question categories rather than broad search

## 16) Observability

Logs:

- What to log: command type, routed surface, session id, missing-doc warnings
- Never log: secrets, credential values, private URLs

Metrics:

- command routing accuracy -> why: detect whether the split is being applied correctly
- duplicate-authority warnings -> why: catch second-tree drift early

Tracing:

- optional for future command telemetry

## 17) Rollout Plan

- Feature flag: no
- Steps:
  1. update bootstrap wording and command guidance
  2. align status/review/resolver behavior with the existing governance hierarchy
  3. verify that workbench navigation remains the execution path

Backout:

- restore the prior command wording and keep roadmap/spec/workbench flow unchanged

## 18) Verification Plan

Commands:

- Lint: `N/A`
- Typecheck: `N/A`
- Unit: `N/A`
- E2E: `N/A`

Test cases:

- TC-01 bootstrap explains the current-state versus goal-state split without introducing a second planning tree
- TC-02 status shows the active workbench session and canonical governance links
- TC-03 review flags any attempt to treat maps as approval authority
- TC-04 resolver routes current-state and goal-state questions to different surfaces

Evidence required:

- updated bootstrap and command guidance recorded in the report

## 19) Risks and Mitigations

- Risk: bootstrap becomes too verbose -> Mitigation: keep the split explanation short and repeatable
- Risk: status output becomes a second dashboard of governance -> Mitigation: restrict it to summaries and pointers
- Risk: review starts judging maps as intent -> Mitigation: explicitly classify maps as evidence-only

## 20) Open Questions

- Q-01 Which commands need the split language directly in their help text versus only in docs?
- Q-02 How much resolver routing should be deterministic before it asks for clarification?

## 21) Acceptance Checklist

- [x] Bootstrap explains the state-vs-goal split
- [x] Status points to active workbench and canonical governance docs
- [x] Review preserves the governance hierarchy
- [x] Resolver routes evidence questions and intent questions differently
- [x] No second governance tree is introduced
