---
doc_type: spec
id: 260306_1815_roadmap-first-governance_spec_01
theme: roadmap-first-governance
status: active
owners:
- orchestrator
created_at: '2026-03-06T18:15:16-03:00'
updated_at: '2026-03-06T19:29:04-03:00'
roadmap_feature: F-01
spec_role: workstream
parent_spec: 260306_roadmap-first-delivery-system_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260306_1815_roadmap-first-governance_plan_01
  task: 260306_1815_roadmap-first-governance_task_01
  report: ''
scope:
  repo_areas:
  - .agents/arc
  - .agents/a-docs
  - .agents/rules
  - .agents/scripts
  packages:
  - agentic scaffold governance
risk_level: high
---

# SPEC: roadmap-first-governance

## 1) Objective
- Define the migration path that will turn the current scaffold into a mandatory roadmap-first system for all future projects.

## 2) Problem
- The scaffold currently allows roadmap and spec artifacts to exist without making them the required entry point for feature work.
- This weakens prioritization, creates gaps between intent and execution, and allows implementation to start before user-facing outcomes are well defined.
- The previously identified telemetry, verification, bootstrap, and testing gaps should be fixed within a stronger governance model instead of as isolated patches.

## 3) Non-goals
- Do not implement the tooling changes in this planning turn.
- Do not write code-level implementation details into the product-governance specification.

## 4) Scope
In scope:
- Plan the migration from optional roadmap/spec usage to mandatory roadmap/spec usage.
- Define how parent specs and child specs should structure large features.
- Organize the known system weaknesses into a phased adaptation backlog.

Out of scope:
- Finishing all enforcement code in this session.
- Reworking unrelated repository processes outside the governance initiative.

## 5) Users and Use Cases
Primary user:
- Repository owners and agents using this scaffold to run real project delivery.

Use cases:
- UC-01 A project owner wants every planned feature visible in a roadmap with a clear status and governing spec.
- UC-02 An agent wants to understand a feature completely before execution by reading the parent spec and any child specs.
- UC-03 A maintainer wants the scaffold to enforce this process so downstream projects cannot silently skip it.

## 6) Assumptions
- Feature intent should be captured before execution artifacts.
- Large features are easier to deliver safely when decomposed through child specs.
- A reusable scaffold must enforce its own planning philosophy or teams will revert to ad hoc behavior.

## 7) Constraints
- Compatibility: Must remain usable across downstream repos with different stacks.
- Repo constraints: Must fit the existing `.agents` structure and workbench flow.
- Security: Governance docs must contain no secrets and should not require implementation detail.

## 8) Proposed Solution
Summary:
- Create a roadmap-first governance layer, anchored by a strategic roadmap and parent specs, then adapt templates, rules, and tooling to enforce it.

Key design choices:
- Roadmap is mandatory -> because projects need a stable feature backlog before execution.
- Parent spec is mandatory for non-trivial features -> because execution tasks alone do not fully describe user intent.
- Child specs are mandatory for large features -> because big initiatives need bounded objectives with traceability.
- Reliability fixes follow governance alignment -> because enforcement and observability should serve the same operating model.

## 9) Architecture Impact
Touched layers:
- `.agents/arc/`
- `.agents/a-docs/`
- `.agents/rules/`
- `.agents/scripts/`

New components:
- Parent governance spec at `.agents/arc/SPECS/260306_roadmap-first-delivery-system_spec_01.md`

Dependency rules:
- Allowed deps: roadmap -> parent spec -> child specs -> workstream artifacts
- Forbidden deps: workstream execution without roadmap/spec definition

## 10) Interfaces
APIs:
- Endpoint: N/A

CLI or scripts:
- Command: `agents-new` | must eventually validate roadmap/spec context for non-trivial work
- Command: `doctor` / `verify` | must eventually validate strategic artifact presence and linkage

Events or jobs:
- Event: governance validation events to be defined during implementation

## 11) Data Model
Entities:
- Feature fields: feature_id, title, status, parent_spec, child_spec_policy, exit_criteria
- Parent spec fields: spec_id, feature_id, user_journey, constraints, acceptance
- Child spec fields: child_spec_id, parent_spec_id, objective, boundaries, acceptance

Storage:
- Markdown artifacts under `.agents/arc/` and `.agents/wb/`

Migrations:
- Yes: templates, rules, validation behavior, and bootstrap defaults need migration

## 12) Flow
Happy path:
1. Define or update a roadmap feature.
2. Write the parent spec before execution starts.
3. Add child specs if the feature is large.
4. Create a workstream that references the roadmap feature and spec artifacts.
5. Execute, verify, and update the roadmap state as work progresses.

Error paths:
- E-01 A feature has execution work but no roadmap entry -> treat as governance failure.
- E-02 A large feature starts without child specs -> block or warn depending on rollout phase.

## 13) Error Handling
- Error taxonomy: governance omission, missing traceability, stale strategic docs
- Retries: not applicable at planning level
- User messages: make missing strategic artifacts explicit and actionable

## 14) Security and Privacy
- Secrets handling: never store secrets in roadmap/spec artifacts
- Permissions: repository maintainers define and approve strategic feature intent
- Threats: hidden work without product definition -> mitigate with validation and mandatory links

## 15) Performance
Budgets:
- Human comprehension: a feature should be understandable from roadmap + spec without reading execution chat history
- Process overhead: quick tasks remain possible, but meaningful feature work must stay explicit

Hot paths:
- Feature definition -> keep roadmap and spec templates concise and structured
- Feature execution handoff -> preserve direct traceability to reduce rediscovery cost

## 16) Observability
Logs:
- What to log: artifact creation, linkage validation failures, governance completion milestones
- Never log: secrets or unnecessary project-sensitive detail

Metrics:
- feature_to_spec_coverage -> shows whether the roadmap is actually governing the backlog
- child_spec_required_vs_present -> shows decomposition discipline on large features
- workstream_traceability_rate -> shows whether execution stays connected to intent

Tracing:
- Use document links as the primary trace system

## 17) Rollout Plan
- Feature flag: conceptual yes, via documentation-first then validation-first rollout
- Steps:
  1. Define roadmap and parent spec philosophy
  2. Update templates and rules
  3. Add workflow and validation enforcement
  4. Fix reliability gaps under the new governance model

Backout:
- Fall back to soft validation warnings temporarily while preserving the roadmap/spec structure

## 18) Verification Plan
Commands:
- Lint: `make lint`
- Typecheck: `N/A`
- Unit: `N/A` for the planning phase
- E2E: `N/A` for the planning phase

Test cases:
- TC-01 Roadmap clearly lists features, governance rules, and follow-up work
- TC-02 Parent spec defines philosophy, user journey, constraints, and acceptance without implementation code
- TC-03 The workstream plan decomposes the migration into actionable implementation phases

Evidence required:
- Lint-clean markdown and traceable links among the new artifacts

## 19) Risks and Mitigations
- Risk: The model becomes too heavy -> Mitigation: define a strict threshold for what counts as non-trivial work.
- Risk: Teams skip maintenance after initial creation -> Mitigation: add validation and review cadence in later phases.
- Risk: Reliability fixes become disconnected from the new governance -> Mitigation: keep them explicitly inside this roadmap feature.

## 20) Open Questions
- Q-01 Should `spec-lite` remain allowed for medium-sized features, or only for bug fixes and local changes?
- Q-02 What exact rule should distinguish quick-mode work from roadmap-governed feature work?
- Q-03 Should child specs get their own index grouped by parent feature?

## 21) Acceptance Checklist
- [x] Scope and non-goals are explicit
- [x] Dependency rules defined
- [x] Verification commands defined
- [x] Rollout and backout defined
- [x] Observability included

---
*Template: `.agents/a-docs/templates/spec.md`*
