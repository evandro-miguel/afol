---
doc_type: spec-child
id: 260509_1453_plan-task-execution-integrity-state-model_spec-child_01
theme: plan-task-execution-integrity-state-model
status: active
owners:
- orchestrator
workstream_intent: feature
artifact_purpose: Define direct-execution plan/task integrity, canonical task states,
  and validation behavior that prevents meta-planning tasks.
created_at: '2026-05-09T14:53:30-03:00'
updated_at: '2026-05-09T14:59:47-03:00'
roadmap_feature: F-18
spec_role: child
parent_spec: 260418_2115_agent-governance-preflight-and-recurrence-guardrails_spec_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  parent_spec: .afol/adm/specs/260418_2115_agent-governance-preflight-and-recurrence-guardrails_spec_01.md
  plan: .afol/wb/260509_1453_plan-task-execution-integrity/260509_1453_plan-task-execution-integrity_plan_01.md
  task: .afol/wb/260509_1453_plan-task-execution-integrity/260509_1453_plan-task-execution-integrity_task_01.md
risk_level: high
---

# SPEC CHILD: plan-task-execution-integrity-state-model

## Intent

- Outcome: workbench plans and tasks describe direct execution of the requested work, and strict validation rejects obvious tasks whose deliverable is just another plan, plan draft, or plan research pass.
- Outcome: task state markers express whether code exists, tests exist, blockers exist, work moved, and whether spec/user-experience validation remains.
- Roadmap feature: `F-18`
- Parent spec: `260418_2115_agent-governance-preflight-and-recurrence-guardrails_spec_01`

## Problem

The current scaffold has strong written guidance, but the system can still produce or accept plan/task artifacts that ask agents to create the plan instead of executing the work. This failure is recurring because guidance alone does not cover every surface:

- templates can still model weak task language;
- parsers and status commands use duplicated state handling;
- strict verification checks structure and evidence, but not direct-execution semantics;
- subagents can mark work complete without an intermediate state that distinguishes code written, tests written, and spec/user-experience validation.

## User or Operator Journey

1. The operator asks for governed work, a plan, or orchestrated execution.
2. The orchestrator performs needed discovery before writing or updating the plan.
3. The workbench plan records facts, scope, sequencing, risks, ownership, and validation for executing the requested work.
4. The workbench task file assigns implementation, documentation, propagation, and validation tasks that agents can execute directly.
5. Agents update task states as work progresses.
6. Strict validation blocks closure when tasks are meta-planning, lack evidence, or claim completion without the required proof for their task type.

## Direct-Execution Contract

Plan artifacts must:

- describe the concrete execution path for the requested work;
- fold completed discovery into facts, assumptions, risks, sequencing, and validation;
- avoid phases whose only outcome is "make the real plan" or "research to make the plan";
- include research tasks only when research is itself the requested deliverable or the smallest blocking proof before safe execution.

Task artifacts must:

- contain executable work items with owner, state, and evidence expectations;
- assign agents to implement, edit, validate, propagate, or report concrete outcomes;
- never use "create/write/prepare the plan" as the task deliverable for a governed execution workstream;
- require a destination and reason when a task moves out of the current plan.

## Canonical Task State Model

| Marker | State | Meaning | Required evidence before `[x]` |
|--------|-------|---------|--------------------------------|
| `[ ]` | `pending` | Work has not started. | None. |
| `[/]` | `in_progress` | Work is actively being executed. | Owner or active lane is visible. |
| `[!]` | `problem` | Work has a blocker, defect, failed check, or unresolved risk. | Blocker/error note plus next action. |
| `[>]` | `moved` | Work intentionally moved to a later plan/session. | Target plan/session/task and reason. |
| `[%]` | `implemented_untested` | Code, docs, or artifact change exists, but validating test/execution proof is missing. | Test/proof or explicit N/A by task type. |
| `[&]` | `tested_needs_spec_validation` | Code and tests exist, but spec or user-experience acceptance is not validated yet. | Spec/user-experience validation or explicit N/A. |
| `[x]` | `done` | Work is complete for the task type. | Closure evidence; code/UI/user-facing work requires implementation, test, and spec/user-experience validation when applicable. |

Legacy state names may be read for compatibility, but new templates, docs, and update commands must present the canonical states above.

## Validation Contract

Strict validation must fail when a plan or task artifact contains task-like directives whose primary deliverable is meta-planning, including:

- creating, drafting, writing, or preparing the plan;
- doing broad research in order to later create the plan;
- assigning a subagent to make a plan instead of execute a slice;
- deferring all actual execution to a later "real plan" without a user-requested planning-only scope.

Strict validation must allow:

- updating a workbench plan or task file when the user explicitly requests governance artifact maintenance;
- updating roadmap/spec/workbench artifacts as concrete feature work;
- research when research is the requested deliverable or the smallest blocking proof before safe execution;
- plan progress maintenance during execution.

Strict validation must also check that:

- `[x]` tasks have closure evidence;
- `[>]` tasks include a destination and reason;
- `[!]` tasks include blocker/error context and next action;
- `[%]` and `[&]` cannot be reported as complete without their missing proof being resolved or marked not applicable.

## Scope

In scope:

- task marker and state mapping updates in scaffold parser/status/update surfaces;
- strict semantic validation for obvious meta-planning tasks;
- focused tests for new markers, status transitions, and semantic rejection;
- scaffold templates and local skill guidance;
- universal-skills and active Codex skill guidance for orchestrator/execution behavior;
- workbench validation evidence for this rollout.

Out of scope:

- automatic migration of every historical workbench session;
- removal of planner or researcher agents;
- replacing all planning artifacts with task-only flows;
- broad semantic inference beyond explicit meta-plan anti-patterns.

## Acceptance

- [ ] Plan and task templates describe direct execution and the canonical state model.
- [ ] `verify-tasks --strict` rejects obvious meta-planning tasks in plan/task artifacts.
- [ ] Status parsing and task update commands understand `[&]` and the new canonical states.
- [ ] `[>]` requires moved-work destination and reason.
- [ ] `[x]` remains a trustworthy completed marker with evidence and spec/user-experience validation when applicable.
- [ ] Universal-skills and active Codex skill copies carry the same orchestrator/execution contract.
- [ ] Focused tests, strict workbench validation, runtime validation, and `just lint` pass or document a concrete blocker.

## Risks and Mitigations

- Risk: validators reject legitimate governance artifact updates.
  Mitigation: match task-like anti-patterns narrowly and keep explicit allowances for requested artifact maintenance.
- Risk: historical sessions use old state names.
  Mitigation: retain read compatibility while making new docs and commands canonical.
- Risk: agents use `[%]` or `[&]` as a holding pattern.
  Mitigation: require final validation gates to fail until those states move to `[x]`, `[!]`, or `[>]` with evidence.
- Risk: global and project skill guidance diverge.
  Mitigation: update project-local, universal source, and active Codex copies in the same governed workstream.

## Verification

- Focused tests for strict semantic rejection:
  - meta-plan task fails;
  - direct execution task passes;
  - requested governance artifact update passes.
- Focused tests for state parsing:
  - all canonical markers parse correctly;
  - legacy aliases remain readable where supported;
  - `[&]` appears in status summaries.
- Focused tests for update actions:
  - problem, moved, implemented-untested, tested-needs-spec-validation, and done transitions behave correctly;
  - done requires evidence;
  - moved requires target/reason when supported by the command surface.
- Workstream validation:
  - `./.agents/agents verify-tasks --strict .afol/wb/260509_1453_plan-task-execution-integrity`
  - `./.agents/agents runtime validate`
  - `just lint`

---

*Template: `docs/templates/spec-child.md`*
