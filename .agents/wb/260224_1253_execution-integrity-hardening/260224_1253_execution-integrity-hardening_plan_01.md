---
doc_type: plan
id: 260224_1253_execution-integrity-hardening_plan_01
theme: execution-integrity-hardening
status: active
owners:
- orchestrator
- worker
- tester
created_at: '2026-02-24T12:54:48-03:00'
updated_at: '2026-02-24T13:07:03-03:00'
repo: agentic_start_folder
branch: main
links:
  spec: 260224_1253_execution-integrity-hardening_spec-lite_01
  prior_report: 260224_1030_scripts-lean-efficiency_report_01
  prior_plan: 260224_1030_scripts-lean-efficiency_plan_01
  architecture: ../../arc/ARCHITECTURE.md
---

# Plan: execution-integrity-hardening

## Objective
- Eliminate false "task completed" claims by enforcing evidence-backed task closure and consistency checks across task, log, and report artifacts.

## Problem Statement
- Current validation passes when checkboxes are marked `- [x]`, even when execution evidence is missing or contradictory.
- This allowed over-claiming in report/log content without a failing gate.

## Scope
- In scope:
  - Add strict verification mode for WB sessions (`verify-tasks --strict`).
  - Require evidence linkage for marking tasks as done (command, result, artifact reference).
  - Detect contradictions in report content (e.g., "all completed" plus "pending execution").
  - Detect timeline/frontmatter temporal inconsistencies.
  - Wire strict verification into `make` validation flow.
  - Add tests and migration path for existing sessions.
- Out of scope:
  - Replacing WB docs with a database system.
  - Rewriting `.agents` tooling in another language.
  - Retroactively rewriting historical sessions without explicit migration command.

## Success Criteria
- `verify-tasks --strict` fails when any task marked done has no evidence reference.
- `verify-tasks --strict` fails on semantic contradictions in report execution status.
- `verify-tasks --strict` fails when timeline entries are later than frontmatter `updated_at` in the same doc.
- `wb-update task --mark-done` requires evidence ID by default (explicit unsafe bypass only with warning flag).
- `make verify-strict` exists and is included in `make all` (or rollout-gated via explicit transition flag).
- New automated tests cover strict-verification and evidence workflows with pass/fail fixtures.

## Delivery Strategy
1. Phase 1: Contract and Evidence Model
   - Define a strict evidence contract for completed tasks.
   - Define contradiction rules for report content and status statements.
   - Define temporal consistency rules for log/report frontmatter.
   - Define compatibility behavior for legacy sessions (warn-only vs hard-fail).
2. Phase 2: Strict Verification Engine
   - Extend `verify-tasks.py` with `--strict` mode.
   - Implement evidence presence checks for done tasks.
   - Implement contradiction checks for report sections and status claims.
   - Implement timeline vs `updated_at` coherence checks.
   - Add machine-readable failure output for CI usage.
3. Phase 3: Evidence-Capture Workflow in WB Update
   - Add `wb-update evidence` command to register command/result artifacts.
   - Persist evidence in session-local ledger (append-only, timestamped).
   - Extend `wb-update task --mark-done` to require evidence reference.
   - Keep compatibility path for controlled bypass (`--allow-unsafe-done`) with explicit warning.
4. Phase 4: Pipeline, Docs, and Rollout
   - Add `make verify-strict` target and integrate into main validation workflow.
   - Update standards and scripts usage docs with new strict workflow.
   - Add migration helper/check for sessions created before strict mode.
   - Produce final report with before/after evidence and residual risks.

## Phase Backlog (Execution Tasks)
1. P1-T01 Define strict evidence schema (required fields, acceptable sources).
2. P1-T02 Define strict report contradiction rules and forbidden combinations.
3. P1-T03 Define temporal coherence checks and parsing edge cases.
4. P1-T04 Approve migration policy for legacy sessions.
5. P2-T01 Implement `--strict` CLI path and structured error model.
6. P2-T02 Implement strict checks for done-task evidence.
7. P2-T03 Implement strict checks for report contradictions.
8. P2-T04 Implement strict checks for timeline/frontmatter timestamps.
9. P2-T05 Add/expand unit tests for strict checker behavior.
10. P3-T01 Implement `wb-update evidence` command and storage format.
11. P3-T02 Enforce evidence requirement in `wb-update task --mark-done`.
12. P3-T03 Add tests for evidence capture and done-gating behavior.
13. P4-T01 Add `make verify-strict` and integrate into verification chain.
14. P4-T02 Update docs and usage examples with strict flow.
15. P4-T03 Run regression (`make doctor`, `make lint`, `make test-scripts`, `make verify-strict`, `make all`).
16. P4-T04 Publish closure report with proof and migration notes.

## Critical Dependencies
- Tools:
  - `python3`
  - `make`
  - `rg`
  - `git`
  - `unittest`
  - `ruff`
- MCPs:
  - None required.
- Skills:
  - `workbench-agent-teams`
  - `code-strategies`
  - `debugging-expert`
- Executor instruction:
  - Confirm whether additional CI constraints or branch-protection checks must consume strict output before implementation starts.

## Large Plan Handling
- This plan remains below split threshold, but execution should still be tracked in phase-scoped task files for reviewability.
- Recommended execution docs: `task_01` (phase 1-2), `task_02` (phase 3), `task_03` (phase 4), plus `report_01`.

## Risks and Mitigations
- Risk: Strict mode breaks legacy sessions unexpectedly.
  - Mitigation: Add explicit migration policy and transitional compatibility flag.
- Risk: Evidence checks are too permissive and do not stop synthetic claims.
  - Mitigation: Require minimum structured evidence fields and source provenance.
- Risk: Evidence checks are too strict and block real workflows.
  - Mitigation: Add documented emergency bypass with explicit audit trail.
- Risk: Semantic contradiction rules produce false positives.
  - Mitigation: Start with deterministic rule set and fixture-driven tests.

## Verification Plan
- Unit:
  - `python3 -m unittest discover -s .agents/scripts/tests -p "test_*.py" -v`
- E2E:
  - `N/A` (can be added later if WB command e2e harness is created)
- Typecheck:
  - `N/A`
- Lint:
  - `make lint`
  - `make lint-scripts`
- Other checks:
  - `./.agents/agents verify-tasks .agents/wb/<session> --strict` must fail/pass deterministically per fixtures.
  - `make verify-strict` must fail on synthetic completion scenarios.
  - Regression: `make doctor && make test-scripts && make verify-strict && make all`.

## Residual Open Decisions
- Decide final strict-mode rollout policy:
  - Option A: strict enabled by default immediately.
  - Option B: strict opt-in for one release cycle, then default.
- Decide evidence ledger location format:
  - Option A: per-session `.evidence.jsonl`.
  - Option B: evidence blocks embedded only in task docs plus hash check.

---
*Template: `.agents/a-docs/templates/plan.md`*
