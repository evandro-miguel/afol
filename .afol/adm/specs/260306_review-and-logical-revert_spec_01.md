---
doc_type: spec
id: 260306_review-and-logical-revert_spec_01
status: active
owners:
- orchestrator
created_at: '2026-03-07T00:28:26Z'
updated_at: '2026-03-06T22:29:30-03:00'
roadmap_feature: F-08
spec_role: child
parent_spec: 260306_context-driven-execution-commands_spec_01
links:
  roadmap: .afol/adm/roadmap/GENERAL-ROADMAP.md
  plan: 260306_2128_context-driven-execution-commands_plan_01
  task: 260306_2128_context-driven-execution-commands_task_01
  report: ''
scope:
  repo_areas:
  - .agents/scripts
  - .afol/wb
  packages:
  - agents-review
  - agents-revert
risk_level: medium
---

# SPEC: review-and-logical-revert

## 1) Feature Intent

- Define command-level contracts for review and logical revert tied to plan/spec evidence and workbench state.

## 2) Problem

- Revert and review are often done manually with inconsistent scopes.
- Without a consistent target model, operators may revert the wrong logical unit.

## 3) Users and User Journey

Primary users:

- Agents and maintainers validating completed work.

User journey:

1. Identify unit (task/phase/pack/session) from session artifacts.
2. Run review with plan/spec constraints.
3. Run revert with explicit scope and confirmation flow.

Failure or friction points:

- Unit boundary mismatch between commits and tasks.
- Revert succeeds on git but leaves workbench metadata inconsistent.

## 4) Experience and Behavior

- Expected behavior:
  - Review consumes scope plus plan/spec and outputs severity-classified findings.
  - Revert executes on logical units with summary plan, not raw filenames.
- Boundaries:
  - Revert is logical-first and git-assisted; it does not replace canonical workbench state.

## 5) Scope

In scope:

- Scope model for task/phase/pack/session.
- Revert precondition checks and summary plan.
- Workbench sync expectations after revert.
Out of scope:
- Full static analysis engine inside the command.

## 6) Child Spec Strategy

- Child specs required: no

## 7) Constraints and Assumptions

- Assumptions:
  - Workbench task plan markers remain available.
- Constraints:
  - User confirmation is mandatory for irreversible actions.

## 8) Acceptance

- Success looks like:
  - Scope and intent are explicit before any data changes.
  - Revert leaves workbench and git state coherent.

## 9) Risks and Tradeoffs

- Risk: Git history not matching plan hashes -> Mitigation: workbench remains source of truth and git is validated as supporting evidence.

## 10) Verification Philosophy

- Evidence expected from delivery:
  - Command-level checks showing preconditions, scope resolution, and post-revert synchronization.

## 11) Acceptance Checklist

- [x] User journey is explicit
- [x] Scope and non-goals are explicit
- [x] Child-spec policy is defined
- [x] Constraints and risks are explicit
- [x] Feature intent is understandable without implementation detail
