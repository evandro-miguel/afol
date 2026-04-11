---
doc_type: plan
id: 260306_1815_roadmap-first-governance_plan_01
theme: roadmap-first-governance
status: final
owners:
- orchestrator
created_at: '2026-03-06T18:15:16-03:00'
updated_at: '2026-03-06T19:29:04-03:00'
roadmap_feature: F-01
parent_spec: 260306_roadmap-first-delivery-system_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  task: 260306_1815_roadmap-first-governance_task_01
repo: agentic_start_folder
branch: main
---

# Plan: roadmap-first-governance

## Objective
- Define the roadmap-first governance model and prepare the scaffold migration plan that will make roadmap and specs mandatory across all downstream projects.

## Scope
- In scope:
  - Convert the project roadmap from a placeholder milestone list into a feature-driven governance artifact.
  - Author the parent specification that defines how roadmap, parent specs, and child specs work together.
  - Translate the previously identified system weaknesses into a phased implementation backlog under the new governance model.
- Out of scope:
  - Implementing the script and template changes in this planning turn.
  - Refactoring unrelated features outside the roadmap/spec governance initiative.

## Success Criteria
- A concrete roadmap exists for the scaffold and defines the strategic features required to reach roadmap-first governance.
- A parent spec exists that explains the philosophy, user journey, and mandatory rules for the system.
- The implementation backlog clearly decomposes follow-up work into enforceable phases and child-spec candidates.

## Delivery Strategy
1. Define the governance model in roadmap and parent spec artifacts.
2. Break the change into implementation phases covering templates, rules, validation, and reliability hardening.
3. Use the resulting plan to drive the next execution workstreams and child specs.

## Critical Dependencies
- Tools:
  - `.agents/agents new`
  - `.agents/agents index`
  - `make lint`
- MCPs:
  - N/A
- Skills:
  - `agentic-system-workflow`
- Executor instruction:
  - Keep the governance model inside the existing `.agents` architecture instead of creating a second planning system.

## Large Plan Handling
- If this plan exceeds 500 lines, split into phases.
- Create one task file per phase.

## Risks and Mitigations
- Risk: Governance becomes too abstract -> Mitigation: make every roadmap feature map to a future enforceable change.
- Risk: The plan drifts from real system gaps -> Mitigation: anchor phases to the telemetry, verification, bootstrap, and testing weaknesses already identified.
- Risk: Templates change before the policy is clear -> Mitigation: finalize the parent spec before implementation work starts.

## Verification Plan
- Unit: `N/A` for the planning turn
- E2E: `N/A` for the planning turn
- Typecheck: `N/A`
- Lint: `make lint`
- Other checks:
  - Confirm traceability between roadmap, parent spec, and this workstream.
  - Update the specs index after adding the parent spec.

## Implementation Phases

### Phase 1: Governance Definition
- Rewrite `.agents/arc/GENERAL-ROADMAP.md` around features, status, and linked specs.
- Create the parent spec for roadmap-first delivery.
- Define when child specs are mandatory.

### Phase 2: Documentation and Template Migration
- Rewrite roadmap, spec, and spec-lite templates around feature intent and user journey.
- Update rules, standards, and AGENTS guidance to make roadmap/spec usage mandatory.
- Define explicit linking fields across roadmap, specs, and workstreams.

### Phase 3: Workflow Enforcement
- Update `agents-new`, bootstrap, and workbench expectations to require strategic artifacts for non-trivial work.
- Add `doctor` and `verify` checks for roadmap/spec presence and linkage.
- Decide how quick-mode exceptions behave without undermining the system.

### Phase 4: Reliability Hardening Under the New Model
- Fix telemetry parity so failures and lifecycle events are recorded truthfully.
- Align `make all`, tests, and CI with documented guarantees.
- Remove false confidence paths from verification and test execution.

---
*Template: `.agents/a-docs/templates/plan.md`*
