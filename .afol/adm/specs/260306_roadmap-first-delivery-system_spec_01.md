---
doc_type: spec
id: 260306_roadmap-first-delivery-system_spec_01
theme: roadmap-first-delivery-system
status: superseded
superseded_by: 260521_0000_total-reformulation-strategy_spec_01
superseded_note: "Superseded by the total reformulation strategy (260521_0000); its concerns were redesigned into the F-01..F-18 feature set."
owners:
- orchestrator
created_at: '2026-03-06T18:15:16-03:00'
updated_at: '2026-06-14T00:00:00+00:00'
links:
  roadmap: 260223_0000_arc_roadmap_01
  plan: 260306_1815_roadmap-first-governance_plan_01
  task: 260306_1815_roadmap-first-governance_task_01
scope:
  repo_areas:
  - .afol/adm
  - docs
  - .agents/scripts
  - .afol/wb
  packages:
  - agentic scaffold governance
risk_level: high
---

# SPEC: Roadmap-First Delivery System

## 1) Objective

- Define a mandatory operating model where roadmap and specs become the canonical source of truth for feature intent across all projects using this scaffold.

## 2) Problem

- The current scaffold supports roadmap, `spec`, and `spec-lite` artifacts, but still allows meaningful work to begin without a maintained roadmap or feature-level specification.
- That makes product intent optional, weakens prioritization, and lets execution artifacts become the first place where requirements are described.
- As a result, workstreams are often clear about activity but not clear enough about why a feature exists, what user journey it serves, and what outcome counts as success.

## 3) Non-goals

- This spec does not define implementation code for the enforcement tooling.
- This spec does not attempt to replace workstreams, task tracking, or verification reports.
- This spec does not force exhaustive heavyweight specs for trivial one-line maintenance tasks.

## 4) Scope

In scope:

- The required role of the roadmap in every project bootstrapped from this scaffold.
- The required role of feature specs before non-trivial implementation work starts.
- The structure and intent of parent specs and child specs.
- The traceability model between roadmap features, specs, and execution workstreams.
- The governance changes needed to adapt templates, rules, bootstrap, validation, and verification.

Out of scope:

- Concrete script implementation details.
- Project-specific business requirements outside the scaffold itself.
- Code-level design decisions for unrelated features.

## 5) Users and Use Cases

Primary users:

- Repository owners using this scaffold as the operating system for a project.
- Agents and contributors who need a reliable source of product intent before implementation.

Use cases:

- UC-01 A project owner opens the roadmap and understands all planned features, their state, and which specs define them.
- UC-02 An agent starts a feature and can read the parent spec before creating execution tasks.
- UC-03 A large feature is decomposed into child specs so each objective can be implemented without losing the parent narrative.
- UC-04 Reviewers can trace a finished workstream back to the roadmap feature and the spec that justified it.

## 6) Assumptions

- Downstream projects need a lightweight but mandatory product-definition layer before execution.
- Most confusion in agentic work comes from missing intent, not from missing execution checklists.
- The scaffold should express philosophy and user journey separately from implementation work.

## 7) Constraints

- Compatibility: Must work for repositories with different stacks and runtimes.
- Repo constraints: Must fit the existing `.agents` structure without creating a second parallel planning system.
- Security: Governance docs must not encourage secrets or sensitive implementation details in specs.
- Operational constraint: Existing workbench flows should be extended, not discarded.

## 8) Proposed Solution

Summary:

- Introduce a roadmap-first operating model where the roadmap is the canonical feature inventory and every meaningful feature is backed by a parent spec.

Key design choices:

- Roadmap as product backlog -> keeps feature intent centralized instead of scattering it across workstreams.
- Parent spec per feature -> captures philosophy, expected behavior, user journey, constraints, and acceptance before implementation.
- Child specs for large features -> let big initiatives decompose into bounded objectives without losing traceability when that decomposition is useful.
- Workstreams as execution-only layer -> preserve plan/task/log/report for delivery, but require linkage to roadmap and specs.
- Mandatory governance -> templates, rules, bootstrap, and validation must enforce this model rather than merely describe it.

## 9) Architecture Impact

Touched layers:

- Strategic docs (`.afol/adm/`)
- Templates and standards (`docs/`)
- Workflow rules (`.afol/adm/rules/`)
- Operational scripts and validators (`.agents/scripts/`)
- Workbench execution artifacts (`.afol/wb/`)

New conceptual components:

- Feature-centric roadmap structure in `.afol/adm/roadmap/GENERAL-ROADMAP.md`
- Parent spec model in `.afol/adm/specs/`
- Child-spec decomposition convention linked to parent specs

Dependency rules:

- Roadmap feature -> must link to parent spec
- Parent spec -> may require child specs before implementation
- Parent specs that declare required child specs must list each child spec by stable
  `doc_id` or repository path under the `Child Spec Strategy` section.
- Child spec frontmatter must carry `parent_spec`, `roadmap_feature`, and
  `spec_role: child`, and the child spec body must name the narrowed objective
  and boundaries that distinguish it from sibling child specs.
- Workstream plan/task/report -> must link back to roadmap/spec context
- Workstream local refinement -> may use `spec` or `spec-lite` at team discretion; neither replaces the governing parent spec
- Execution work -> must not become the first place where a feature is defined

## 10) Interfaces

User-facing governance interfaces:

- Roadmap entry: defines feature identity, priority, state, and strategic completion tasks
- Parent spec: defines feature meaning, scope, user journey, constraints, and acceptance
- Child spec: defines one bounded objective under a large parent feature when decomposition is helpful
- Workstream artifacts: define how the approved feature is executed and verified

Operational interfaces:

- Bootstrap must create the mandatory roadmap/spec baseline
- New-workstream flow must request or validate roadmap/spec linkage for non-trivial work
- Doctor/verify flows must detect missing required strategic artifacts

## 11) Data Model

Entities:

- Feature
  - fields: feature_id, title, status, linked_parent_spec, child_spec_policy, priority, exit_criteria
- Parent spec
  - fields: spec_id, feature_id, intent, user_journey, scope, constraints, acceptance
- Child spec
  - fields: child_spec_id, parent_spec_id, objective, boundaries, acceptance
- Workstream
  - fields: session_id, linked_feature_id, linked_spec_ids, execution_state

Storage:

- Roadmap and specs remain markdown-first repository artifacts

Migrations:

- Yes, existing templates, docs, and validators will need migration to the new governance model

## 12) Flow

Happy path:

1. Project owner defines or updates a roadmap feature.
2. The feature receives a parent spec before implementation starts.
3. If the feature benefits from decomposition, the parent spec declares child specs.
4. Once strategic definition is complete, a workstream is created for execution.
5. Plans, tasks, logs, and reports reference the roadmap feature and governing spec(s).
6. Delivery completes and roadmap/spec state are updated to reflect reality.

Error paths:

- E-01 Feature exists in execution but not in roadmap -> block or flag as invalid governance state.
- E-02 Feature has no governing spec -> do not allow non-trivial implementation to proceed.
- E-03 A feature clearly needs decomposition but has no child specs -> flag for review before implementation.
- E-04 Roadmap and spec drift apart -> require reconciliation before marking work complete.

Child-spec decomposition threshold:

- Required when a feature crosses more than one architectural surface such as
  CLI, runtime, MCP, docs/bootstrap, or validation.
- Required when independent teams or agents can safely own separate objectives.
- Required when a feature has distinct acceptance journeys that would make one
  parent spec too broad to review.
- Recommended when the parent spec has more than one risky migration phase or
  when rollback differs by phase.
- Not required for a small workstream refinement that stays in one module and
  can be fully explained in the parent spec plus workbench plan.

## 13) Error Handling

- Governance violations should be treated as planning/validation errors, not silent warnings.
- Early phases may use warnings while templates and docs are migrated.
- Final state should favor deterministic blocking for missing mandatory artifacts.

## 14) Security and Privacy

- Specs must never include secrets or sensitive credentials.
- Specs should describe behavior and constraints, not operational secrets or exploit detail.
- Governance automation must avoid logging confidential project details unnecessarily.

## 15) Performance

Budgets:

- Human comprehension is the main performance goal: artifacts should be faster to understand than ad hoc chat history.
- Governance overhead should stay low enough that small projects remain usable.

Hot paths:

- Creating a feature
- Understanding a feature before implementation
- Reviewing whether delivery matches intended behavior

## 16) Observability

Logs:

- Record when governance artifacts are created, linked, or fail validation
- Never log secrets or unrelated local data

Metrics:

- Percentage of roadmap features with parent specs
- Percentage of decomposed features with child specs
- Percentage of workstreams linked to roadmap/spec artifacts
- Governance validation failures by type

Tracing:

- Traceability should be document-based: roadmap feature -> spec -> child spec -> workstream -> report

## 17) Rollout Plan

- Feature flag: conceptually yes; rollout should move from documentation -> soft validation -> hard validation
- Steps:
  1. Define the philosophy and roadmap baseline
  2. Rewrite templates and standards
  3. Update rules and bootstrap defaults
  4. Add validation and workflow enforcement
  5. Harden telemetry, verification, tests, and CI under the new model

Backout:

- If enforcement proves too rigid, temporarily fall back to warnings while preserving the new documentation model

## 18) Verification Plan

Commands:

- Lint: `just lint`
- Typecheck: `N/A`
- Unit: `just test-scripts`
- E2E: `N/A` for this planning phase

Validation cases:

- VC-01 The roadmap expresses features as linked strategic items rather than vague milestones
- VC-02 The parent spec explains feature philosophy, user journey, and acceptance without code
- VC-03 The implementation plan clearly decomposes later work into template/rule/tooling phases

Evidence required:

- Clean markdown lint for changed docs
- Traceable links between roadmap, parent spec, and workstream plan

## 19) Risks and Mitigations

- Risk: The model becomes documentation theater -> Mitigation: enforce linkage and validation in tooling.
- Risk: The model is too heavy for small changes -> Mitigation: preserve a narrow quick-mode escape hatch with clear thresholds.
- Risk: Teams confuse specs with implementation docs -> Mitigation: define specs as behavior/philosophy artifacts and keep code out.
- Risk: Existing docs drift during migration -> Mitigation: roll out templates and validations before hard enforcement.

## 20) Open Questions

- Q-01 Answered: `spec-lite` remains a discretionary option whenever a lighter local refinement is enough; the mandatory artifact is the governing parent spec, not a specific local spec depth.
- Q-02 How strict should roadmap/spec gating be for quick tasks in an active session?
- Q-03 Answered: child specs live in `.afol/adm/specs/` by default and may also
  use feature-level subfolders such as `.afol/adm/specs/F-14/` when a feature
  owns multiple strategy artifacts; indexes must keep the stable doc IDs
  discoverable either way.

## 21) Acceptance Checklist

- [x] Scope and non-goals are explicit
- [x] Dependency rules defined
- [x] Verification commands defined
- [x] Rollout and backout defined
- [x] Observability included

---

*Spec: `.afol/adm/specs/260306_roadmap-first-delivery-system_spec_01.md`*
