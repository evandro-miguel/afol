---
doc_type: spec
id: 260306_guided-status-and-implementation_spec_01
status: active
owners:
- orchestrator
created_at: '2026-03-07T00:28:26Z'
updated_at: '2026-03-06T22:29:30-03:00'
roadmap_feature: F-08
spec_role: child
parent_spec: 260306_context-driven-execution-commands_spec_01
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  plan: 260306_2128_context-driven-execution-commands_plan_01
  task: 260306_2128_context-driven-execution-commands_task_01
  report: ''
scope:
  repo_areas:
  - .agents/scripts
  - .afol/wb
  packages:
  - agents-status
  - agents-implement
risk_level: medium
---

# SPEC: guided-status-and-implementation

## 1) Feature Intent

- Implement guided status and implementation workflows that can run on top of existing roadmap/spec/task artifacts.
- Keep execution deterministic and traceable via workbench updates.

## 2) Problem

- Operators may need multiple commands to infer the next step.
- Current scripts do not yet provide a compact, structured status/next task command.

## 3) Users and User Journey

Primary users:

- Engineers operating the scaffold in active sessions.
- Agents receiving execution instructions from runtime wrappers.

User journey:

1. Ask for status and get one next action.
2. Execute guided implementation step by step from approved tasks.
3. See task state transition and evidence captured in workbench files.

Failure or friction points:

- Status points to wrong artifact due to mixed naming.
- Implement step executes out of order or without plan context.

## 4) Experience and Behavior

- Expected behavior:
  - `status` reports active session, next pending task, completed progress, roadmap context, and blockers.
  - `implement` consumes plan/task context and enforces prerequisite completion.
- Boundaries:
  - No autonomous coding loop.

## 5) Scope

In scope:

- A status command that consumes plan/task/report and roadmap context.
- A first-phase implementation command path with guarded preconditions.

Out of scope:

- Full CI-aware auto-coding loop or autonomous patching.

## 6) Child Spec Strategy

- Child specs required: no

## 7) Constraints and Assumptions

- Assumptions:
  - Workbench remains the source of execution truth.
- Constraints:
  - No command should bypass workbench task/report evidence.

## 8) Acceptance

- Success looks like:
  - Next action is explicit and repeatable.
  - No command proceeds with missing prerequisites.

## 9) Risks and Tradeoffs

- Risk: status drift if task format changes -> Mitigation: parse based on frontmatter + tolerant fallback regex.
- Tradeoff: conservative status output initially -> Why accepted: avoids false confidence from partial automation.

## 10) Rollout and Lifecycle

- Rollout approach:
  - Add status first.
  - Add implementation execution once task state model is stable.

## 11) Verification Philosophy

- Evidence expected from delivery:
  - Command outputs with deterministic next-task resolution.

## 12) Acceptance Checklist

- [x] User journey is explicit
- [x] Scope and non-goals are explicit
- [x] Child-spec policy is defined
- [x] Constraints and risks are explicit
- [x] Feature intent is understandable without implementation detail
