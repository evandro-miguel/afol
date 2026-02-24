---
doc_type: plan
id: 260224_1030_scripts-lean-efficiency_plan_01
theme: scripts-lean-efficiency
status: active
owners:
- orchestrator
- worker
- tester
created_at: '2026-02-24T10:30:20-03:00'
updated_at: '2026-02-24T14:30:52-03:00'
repo: agentic_start_folder
branch: main
links:
  spec: 260224_1030_scripts-lean-efficiency_spec-lite_01
  architecture: ../../arc/ARCHITECTURE.md
---

# Plan: scripts-lean-efficiency

## Objective
- Make the `.agents/scripts` system leaner and easier to maintain without losing any currently available capability.

## Non-Negotiable Constraints
- No command/function removal without explicit user approval.
- Keep behavior parity for public entrypoints (`make` targets and `./.agents/agents` commands).
- Keep changes incremental and test-backed.

## Scope
- In scope:
  - Consolidate overlapping script surfaces.
  - Reduce complexity hotspots in critical scripts.
  - Improve coverage and integration tests for core workflows.
  - Align docs with the final command surface.
- Out of scope:
  - Rewriting in another runtime/language.
  - Broad dependency expansion without explicit justification.
  - AGENTS placeholder policy changes.

## Success Criteria
- All baseline public commands still work after refactor.
- Complexity findings (`ruff --select C901`) reduced on targeted hotspots.
- Productive scripts coverage materially improved from baseline.
- Final validation green: `make doctor`, `make lint`, `make test-scripts`, `make tools-check`, `make all`.

## Delivery Strategy
1. Phase 1 (`task_01`): Baseline and parity contract.
2. Phase 2 (`task_02`): Command-surface consolidation and compatibility aliases.
3. Phase 3 (`task_03`): Complexity reduction and shared helper extraction.
4. Phase 4 (`task_04`): Integration tests, quality gates, docs, and final regression.

## Critical Dependencies
- Tools:
  - `make`
  - `./.agents/agents`
  - `git`
  - `rg`
  - `ruff`
  - `coverage` / `unittest`
- MCPs:
  - None required.
- Skills:
  - `workbench-agent-teams`
  - `code-review-expert`
  - `code-strategies`
- Executor instruction:
  - Confirm dependency availability before each phase.

## Risks and Mitigations
- Risk: Behavior regression during consolidation.
  - Mitigation: Baseline parity matrix and regression checks after each phase.
- Risk: Refactor with low ROI.
  - Mitigation: Prioritize only measured hotspots and stop when targets are met.
- Risk: Coverage number confusion.
  - Mitigation: Track productive-code coverage separately from tests/docs.

## Verification Plan
- Baseline metrics:
  - `ruff check .agents/scripts --select C901`
  - `coverage run --source=.agents/scripts -m unittest discover -s .agents/scripts/tests -p 'test_*.py'`
  - `coverage report -m`
- Functional regression:
  - `make doctor`
  - `make lint`
  - `make test-scripts`
  - `make tools-check`
  - `make all`

---
*Template: `.agents/a-docs/templates/plan.md`*
