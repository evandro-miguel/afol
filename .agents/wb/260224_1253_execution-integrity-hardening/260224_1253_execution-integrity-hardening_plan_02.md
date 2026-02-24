---
doc_type: plan
id: 260224_1253_execution-integrity-hardening_plan_02
theme: execution-integrity-hardening
status: active
owners:
- orchestrator
- worker
- tester
created_at: '2026-02-24T16:05:00-03:00'
updated_at: '2026-02-24T18:06:40-03:00'
repo: agentic_start_folder
branch: main
links:
  prior_plan: 260224_1253_execution-integrity-hardening_plan_01
  prior_report: 260224_1253_execution-integrity-hardening_report_01
  log: 260224_1253_execution-integrity-hardening_log_01
---

# Plan: execution-integrity-hardening (Operational Reliability)

## Objective
- Ensure the `.agents` system works reliably end-to-end in real execution, not only by checklist state.

## Scope
- In scope:
  - Validate every critical command path (`.agents/agents`, `make`, direct script execution).
  - Enforce strict task completion with evidence and contradiction/temporal checks.
  - Add missing guardrails to prevent false completion claims.
  - Verify command, docs, and Makefile parity for core workflows.
  - Define and execute a deterministic release-quality verification matrix.
- Out of scope:
  - Large architecture rewrites unrelated to reliability outcomes.
  - New feature expansion not tied to operational correctness.

## Success Criteria
- `make doctor`, `make lint`, `make test-scripts`, `make verify-active`, `make verify-strict`, `make tools-check`, and `make all` pass in the intended workflow baseline.
- Every `wb-update task --mark-done` in active workflow is backed by a valid evidence record (or explicit unsafe bypass).
- Wrapper/help, standards docs, and Make targets are aligned for core WB commands.
- At least one full dry-run from session planning -> task updates -> verification -> report closure completes with zero manual patching outside supported commands.
- No unresolved contradiction or temporal inconsistency in active session strict verification output.

## Delivery Strategy
1. Baseline and Gap Audit
   - Build a reliability matrix for all critical commands and identify failing/non-deterministic flows.
2. Guardrail Completion
   - Close remaining enforcement gaps in command workflows, validation gates, and operational docs.
3. End-to-End Validation
   - Execute the full matrix and capture evidence in task/log/report artifacts.
4. Hardening and Rollout Readiness
   - Add post-merge checks, fallback policy, and runbook for repeated multi-session execution.

## Phase Backlog
1. P1-T01 Build command reliability matrix (wrapper/make/script level).
2. P1-T02 Classify failures by type: contract, implementation, docs parity, environment sensitivity.
3. P1-T03 Define severity and remediation order (critical -> high -> medium).
4. P2-T01 Enforce strict done-path gates for task closure workflows.
5. P2-T02 Align command usage docs with actual CLI behavior.
6. P2-T03 Add missing Make targets/aliases required by documented workflows.
7. P2-T04 Add regression tests for enforcement and evidence contracts.
8. P3-T01 Execute full verification matrix and collect command-result evidence.
9. P3-T02 Validate timeline/frontmatter coherence and strict report consistency.
10. P3-T03 Validate multi-session concurrency behavior (active session + explicit session writes).
11. P4-T01 Produce readiness report with residual risks and mitigations.
12. P4-T02 Define ongoing operational policy (unsafe bypass governance, failure playbook).

## Critical Dependencies
- Tools:
  - `python3`
  - `uv`
  - `make`
  - `ruff`
  - `git`
- MCPs:
  - None required.
- Skills:
  - `workbench-agent-teams`
  - `debugging-expert`
  - `code-strategies`
- Executor instruction:
  - Verify if any CI policy or branch protection must consume strict verification outputs before rollout.

## Risks and Mitigations
- Risk: Existing legacy lint debt blocks full green status.
  - Mitigation: Separate legacy baseline debt from new regression scope and gate only touched paths for immediate rollout.
- Risk: Unsafe bypass (`--allow-unsafe-done`) gets overused.
  - Mitigation: Require explicit audit log entry and periodic report of bypass usage.
- Risk: Multi-session concurrency creates accidental writes in wrong session.
  - Mitigation: Keep explicit `--session` as write requirement and add workflow checks before execution.
- Risk: Docs drift from CLI behavior over time.
  - Mitigation: Add parity check step in release checklist with doc examples tested as commands.

## Verification Plan
- Unit:
  - `python3 -m unittest discover -s .agents/scripts/tests -p "test_*.py" -v`
- E2E:
  - `python3 .agents/scripts/tests/integration/test_critical_workflows.py`
- Typecheck:
  - `N/A`
- Lint:
  - `make lint`
  - `cd .agents/scripts && uv run ruff check .`
- Other checks:
  - `make verify-active`
  - `make verify-strict`
  - `./.agents/agents verify-tasks .agents/wb/260224_1253_execution-integrity-hardening --strict`
  - `make all`

## Exit Criteria
- All critical-path checks pass or are documented as approved legacy exceptions with remediation owners.
- Reliability report includes evidence IDs, command outputs, and explicit residual risk acceptance.
- Session is executable by another agent without hidden assumptions.

---
*Template: `.agents/a-docs/templates/plan.md`*
