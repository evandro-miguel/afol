---
doc_type: spec
id: 260306_artifact-resolution-layer_spec_01
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
  - .agents/wb
  packages:
  - agents-status
risk_level: medium
---

# SPEC: artifact-resolution-layer

## 1) Feature Intent
- Create a deterministic resolver for logical artifact names to physical files so commands can operate without hardcoded paths.
- Keep resolution behavior explicit and auditable, with clear precedence and fallback rules.

## 2) Problem
- Command implementations can fail or behave inconsistently when operators and scripts use different file assumptions.
- The scaffold currently relies on conventions spread across scripts and docs, not a single resolver contract.

## 3) Users and User Journey
Primary users:
- Agents and operators using the `.agents` command layer.
- Runtime wrappers (OpenCode/Codex/Qwen/Gemini) that call command scripts.

User journey:
1. Command asks for artifact by logical name (`plan`, `task`, `active_session`, `roadmap`).
2. Resolver returns a concrete path or emits actionable failure context.
3. Command updates/reads the correct file without directory or path guesswork.

Failure or friction points:
- Missing artifact file -> resolver returns typed guidance and does not assume fallback behavior.
- Multiple candidate files -> resolver returns the latest stable session artifact by naming convention.

## 4) Experience and Behavior
- Expected behavior:
  - A single shared helper supports artifact names:
    - `active_session`, `roadmap`, `session`, `plan`, `task`, `spec`, `report`, `log`, `workflow`, `knowledge`
  - Resolution uses stable conventions and explicit error messages when mandatory artifacts are missing.
  - CLI status uses this resolver by default.
- Boundaries:
  - Resolver does not infer custom user-defined artifact layouts.
  - Resolver reads only from canonical `.agents` locations and explicit session folder context.

## 5) Scope
In scope:
- Logical artifact names and precedence rules.
- Session-scoped and global artifact resolution helpers.
- Error shape for missing/ambiguous resolution.

Out of scope:
- Full command flow for implementation/review/revert.
- Git history traversal logic.

## 6) Child Spec Strategy
- Child specs required: no
- Planned child specs:
  - none

## 7) Constraints and Assumptions
- Assumptions:
  - Session artifacts remain in the existing `*.agents/wb/<session>/` layout.
- Constraints:
  - Compatibility with existing templates and naming conventions.
  - Resolver must be deterministic and side-effect free.

## 8) Acceptance
- Success looks like:
  - A single helper can resolve required logical artifact names consistently.
  - All command implementations that consume it use identical outputs.
- Review questions:
  - Are there edge cases not covered by canonical naming?
  - Are fallback rules obvious enough to prevent silent mis-resolution?

## 9) Risks and Tradeoffs
- Risk: over-strict resolver blocks unconventional repo layouts -> Mitigation: explicit optional aliases and documented extension points.
- Tradeoff: adding resolver abstraction adds maintenance overhead -> Why accepted: reduces command-level drift.

## 10) Rollout and Lifecycle
- Rollout approach:
  - Implement resolver first; then rewrite status to consume it.
- Workstream linkage:
  - Linked via `F-08`.

## 11) Verification Philosophy
- Evidence expected from delivery:
  - Deterministic tests and manual checks proving expected mapping and explicit failure messages.

## 12) Acceptance Checklist
- [x] User journey is explicit
- [x] Scope and non-goals are explicit
- [x] Child-spec policy is defined
- [x] Constraints and risks are explicit
- [x] Feature intent is understandable without implementation detail
