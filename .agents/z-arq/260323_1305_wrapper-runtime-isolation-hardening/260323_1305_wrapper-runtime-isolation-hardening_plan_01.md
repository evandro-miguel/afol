---
doc_type: plan
id: 260323_1305_wrapper-runtime-isolation-hardening_plan_01
theme: wrapper-runtime-isolation-hardening
status: final
owners:
- orchestrator
created_at: '2026-03-23T13:05:37-03:00'
updated_at: '2026-03-23T13:59:10-03:00'
roadmap_feature: F-06
parent_spec: 260306_primary-agent-runtime-compatibility_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  task: 260323_1305_wrapper-runtime-isolation-hardening_task_01
  brainstorm: 260323_1305_wrapper-runtime-isolation-hardening_brainstorm_01
  explorer_check: 260323_1305_wrapper-runtime-isolation-hardening_explorer-check_01
repo: agentic_start_folder
branch: main
---

# Plan: wrapper-runtime-isolation-hardening

## Objective
- Restore the scaffold's ability to run from an isolated workspace without global runtime assumptions.

## Scope
- In scope:
  - Make `.agents/agents` run commands through the local virtualenv when available.
  - Localize `uv` cache usage for setup and validation flows.
  - Close the CI/test gap that missed the wrapper failure.
- Out of scope:
  - New user-facing features unrelated to runtime isolation.
  - Changes to roadmap philosophy or runtime support matrix.

## Success Criteria
- `.agents/agents <command>` works with the local `.venv` even when `uv` is absent from `PATH`.
- Validation commands avoid user-global `~/.cache/uv` assumptions.
- CI fails if wrapper isolation or Python linting regresses.

## Delivery Strategy
1. Patch the wrapper and validation entrypoints to be hermetic by default.
2. Add focused automated coverage for the isolated-wrapper scenario.
3. Update standards/docs and record the lesson from this correction.

## Verification Plan
- `make lint-scripts`
- `make test-scripts`
- `make lint`
- `make doctor`
