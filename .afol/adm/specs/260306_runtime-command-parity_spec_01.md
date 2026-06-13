---
doc_type: spec
id: 260306_runtime-command-parity_spec_01
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
  - .agents
  packages:
  - runtime mirrors
  - AGENTS.md
risk_level: medium
---

# SPEC: runtime-command-parity

## 1) Feature Intent

- Keep command semantics stable across OpenCode, Codex, Qwen, and Gemini-facing adapters.
- Ensure canonical behavior remains in `AGENTS.md` and `.agents` while adapters stay thin.

## 2) Problem

- Command UX can drift when runtime adapters implement partially overlapping behavior.

## 3) Users and User Journey

Primary users:

- Operators using any supported runtime.

User journey:

1. Same command input resolves to same artifact and output behavior across runtimes.
2. Any runtime-specific behavior is documented and justified.

Failure or friction points:

- Asymmetric command names or outputs across adapters.

## 4) Experience and Behavior

- Expected behavior:
  - `status` semantics are documented in AGENTS canonical docs and mirrors.
  - Adapter-specific details are documented where required; not implemented in duplicate script logic.
- Boundaries:
  - Does not include unrelated runtime toolchain changes outside command layer.

## 5) Scope

In scope:

- Canonical semantics doc for F-08 commands.
- Mirror updates for command usage and constraints.
- Verification that mirrors and canonical docs stay aligned.

Out of scope:

- Runtime-local behavior not related to execution commands.

## 6) Child Spec Strategy

- Child specs required: no

## 7) Constraints and Assumptions

- Constraints:
  - Keep committed adapters minimal.
  - No runtime credentials in canonical docs.

## 8) Acceptance

- Success looks like:
  - Same user command path produces equivalent result in supported runtimes.

## 9) Risks and Tradeoffs

- Risk: stale mirrors after edits -> Mitigation: explicit sync step in rollout.

## 10) Verification Philosophy

- Evidence expected from delivery:
  - Sync and parity checks documented and executed for command set.

## 11) Acceptance Checklist

- [x] User journey is explicit
- [x] Scope and non-goals are explicit
- [x] Child-spec policy is defined
- [x] Constraints and risks are explicit
- [x] Feature intent is understandable without implementation detail
