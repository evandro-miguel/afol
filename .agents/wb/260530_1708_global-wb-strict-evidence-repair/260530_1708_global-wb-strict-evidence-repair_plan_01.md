---
doc_type: plan
id: 260530_1708_global-wb-strict-evidence-repair_plan_01
theme: global-wb-strict-evidence-repair
status: final
owners:
- orchestrator
workstream_intent: delivery
artifact_purpose: Define the concrete execution path for work that will actually be
  performed.
created_at: 2026-05-30 17:08:10-03:00
updated_at: '2026-05-30T17:21:38-03:00'
roadmap_feature: F-11
parent_spec: 260521_0110_validation-ci-and-benchmarks_spec_01
child_spec: null
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  task: 260530_1708_global-wb-strict-evidence-repair_task_01
  brainstorm: null
  explorer_check: null
  research: null
  postmortem: null
repo: agentic_start_folder_dev_refactor_TS
branch: dev_refactor_TS
output_artifacts:
  primary:
    plan: 260530_1708_global-wb-strict-evidence-repair_plan_01
    task: 260530_1708_global-wb-strict-evidence-repair_task_01
  sidecars:
    brainstorm: null
    research: null
    explorer_check: null
    postmortem: null
  sidecar_justification:
    brainstorm: not_required
    research: not_required
    explorer_check: not_required
    postmortem: not_required
---

# Plan: global-wb-strict-evidence-repair

## Output Artifacts (file-first)

- Primary artifact: `plan`
- Sidecars:
  - brainstorm: ``
  - research: ``
  - explorer_check: ``
  - postmortem: ``
- Sidecar justification:
  - Provide one value per optional artifact, or `not_required`.

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current as work proceeds. Follow `PLANS.md` from the repository root when writing or revising this file.

## Purpose / Big Picture

- Repair strict verification at the workbench root so historical sessions are
  checked against their own evidence ledgers instead of inheriting the wrong
  scope.
- Preserve the existing strict contract: missing historical evidence remains a
  real failure until reconciled with ledger entries and sidecar justification.
- Operators can see the behavior through
  `./.agents/agents verify-tasks --strict .agents/wb`, which should report no
  evidence-scope false positives once this task is closed.

## Execution Contract

- Every step must be an action an agent can execute now.
- Code changes stay limited to the strict task verifier and focused tests.
- Historical workbench changes must be reconciliation artifacts based on
  existing final reports and command evidence, not invented task completion.
- The active task closes only after focused unit tests and strict workbench
  verification pass.

## Progress

- [x] 2026-05-30 17:08-03 - Created governed session and moved T-01 to
  in_progress.
- [x] 2026-05-30 17:10-03 - Delegated implementation to a builder agent for
  `verify-tasks.py` and focused strict-verification tests.
- [x] 2026-05-30 17:12-03 - Reconciled the remaining historical evidence
  issues in `260413_1551_python-runtime-hardening` from its final report.
- [x] 2026-05-30 17:15-03 - Added required sidecar justification sections to
  the historical brainstorm, explorer-check, and research artifacts.
- [x] 2026-05-30 17:16-03 - Re-ran focused unit tests and strict verification
  for the historical session.

## Surprises & Discoveries

- Observation: The initial root-level strict failure was mostly a verifier scope
  bug, but after that bug was fixed one historical session still had genuine
  missing ledger evidence.
  Evidence: root strict dropped from broad evidence issues to only the
  `260413_1551_python-runtime-hardening` tasks, then that session passed after
  ledger reconciliation.
- Observation: The same historical session also had three optional sidecars
  without the required `Sidecar Justification` section.
  Evidence: `verify-tasks --strict` reported the brainstorm, explorer-check,
  and research sidecars until the required sections were added.

## Decision Log

- Decision: Resolve evidence ledgers per session scope when verifying a
  workbench root.
  Rationale: Task IDs repeat across sessions, so a root-level verifier must not
  use one global task/evidence cache.
  Date/Author: 2026-05-30 17:10-03 / builder agent
- Decision: Backfill `260413_1551_python-runtime-hardening` evidence from its
  existing final report rather than changing historical task states.
  Rationale: The report already recorded the aggregate gates and strict
  verification outcome for all nine completed tasks.
  Date/Author: 2026-05-30 17:12-03 / orchestrator
- Decision: Keep optional sidecars and add explicit justification sections.
  Rationale: The sidecars document real closure context and strict verification
  requires why each optional artifact affected execution.
  Date/Author: 2026-05-30 17:15-03 / orchestrator

## Outcomes & Retrospective

- Outcome: Root strict verification now resolves session evidence correctly and
  the previously failing historical session passes strict verification.
- Remaining: Close this active task with ledger evidence, rerun root strict, and
  commit the verifier, tests, and governed reconciliation artifacts.
- Lesson: Workbench-root verification needs session-scoped evidence caches
  because `T-01` and similar task IDs are intentionally reused across sessions.

## Governance Context

- Roadmap feature: `F-11`
- Parent spec: `260521_0110_validation-ci-and-benchmarks_spec_01`
- Child spec: ``
- Planning rule:
  - Do not redefine feature philosophy here; use this file to plan execution of already-defined intent.
  - This plan must describe the direct execution path for the requested work, not pre-planning or generic research tasks.
  - Brainstorm, explorer-check, and research artifacts are optional sidecars only when they are the requested deliverable or the smallest blocking proof before safe execution.

## Planning Inputs

- Task artifact: `260530_1708_global-wb-strict-evidence-repair_task_01` (required)
- Brainstorm artifact: `` (optional)
- Explorer check artifact: `` (optional)
- Research artifact: `` (optional)
- Postmortem artifact: `` (optional)
- Knowledge lookup performed:
  - Current root strict output identified the failure mode; no separate
    knowledge pull was needed because the issue was local verifier behavior.

## Context and Orientation

- `.agents/scripts/verify-tasks.py` is the CLI verifier used by
  `./.agents/agents verify-tasks`.
- `.agents/scripts/tests/test_verify_tasks_strict.py` contains focused
  regression tests for strict mode.
- `.agents/wb/<session>/.evidence.jsonl` is the task-scoped evidence ledger.
  Root verification must load the ledger belonging to each session folder.

## Scope

- In scope:
  - Fix root-level strict evidence resolution for repeated task IDs across
    workbench sessions.
  - Add focused regression coverage for session-scoped evidence lookup.
  - Reconcile the historical `260413_1551_python-runtime-hardening` strict
    failures with existing report-backed evidence and sidecar justifications.
- Out of scope:
  - Redesigning the workbench ledger format.
  - Rewriting historical task content beyond the minimum strict reconciliation.
  - Changing roadmap or parent spec scope.

## Plan of Work

- Update `.agents/scripts/verify-tasks.py` so workbench-root verification
  resolves evidence ledgers from the nearest containing session directory.
- Add strict-mode regression tests in
  `.agents/scripts/tests/test_verify_tasks_strict.py` proving that root
  verification uses the correct session ledger and does not leak evidence
  across sessions with the same task ID.
- Use `./.agents/agents wb-update evidence` only for historical reconciliation
  that is backed by existing report evidence.
- Add `Sidecar Justification` sections to the three historical optional
  sidecars that strict verification still flagged.
- Verify with focused unit tests, session strict checks, and root strict checks.

## Concrete Steps

1. Edit `.agents/scripts/verify-tasks.py` to resolve evidence scope per session.
2. Add focused tests in `.agents/scripts/tests/test_verify_tasks_strict.py`.
3. Register historical evidence for
   `.agents/wb/260413_1551_python-runtime-hardening` from its report.
4. Add required sidecar justification sections to the three historical
   optional sidecars.
5. Run `.agents/scripts/.venv/bin/python -m unittest discover -s .agents/scripts/tests -p 'test_verify_tasks_strict.py'`.
6. Run `./.agents/agents verify-tasks --strict .agents/wb/260413_1551_python-runtime-hardening`.
7. Run `./.agents/agents verify-tasks --strict .agents/wb` after this task is
   closed.

## Interfaces and Dependencies

- Tools:
  - `./.agents/agents verify-tasks`
  - `./.agents/agents wb-update evidence`
  - `./.agents/agents implement complete`
- MCPs:
  - N/A
- Skills:
  - `agentic-orchestrator`
  - `agentic-folder-sys`
- Files and interfaces that must exist at the end:
  - `.agents/scripts/verify-tasks.py`
  - `.agents/scripts/tests/test_verify_tasks_strict.py`
  - `.agents/wb/260413_1551_python-runtime-hardening/.evidence.jsonl`
  - `.agents/wb/260530_1708_global-wb-strict-evidence-repair/.evidence.jsonl`

## Risks and Mitigations

- Risk: Root strict could pass by accidentally reusing evidence from another
  session. -> Mitigation: add a regression where two sessions share `T-01` but
  only one has valid evidence.
- Risk: Historical reconciliation could hide missing work. -> Mitigation: use
  only the existing final report and command evidence as the artifact basis.

## Validation and Acceptance

- Unit: `.agents/scripts/.venv/bin/python -m unittest discover -s .agents/scripts/tests -p 'test_verify_tasks_strict.py'`
- E2E: `./.agents/agents verify-tasks --strict .agents/wb`
- Typecheck: N/A for this Python verifier patch.
- Lint: `git diff --check`
- Behavioral acceptance:
  - Root strict verification reports completed tasks without evidence-scope
    false positives.
  - The historical `260413_1551_python-runtime-hardening` session passes strict
    verification independently.

## Idempotence and Recovery

- Focused tests and strict verification commands are read-only and safe to
  rerun.
- Evidence backfill commands are append-only; if repeated, inspect
  `.evidence.jsonl` and avoid creating duplicate reconciliation records.
- File edits are ordinary git-tracked changes and can be reviewed with
  `git diff`.

## Artifacts and Notes

- Historical strict verification result after reconciliation:
  `./.agents/agents verify-tasks --strict .agents/wb/260413_1551_python-runtime-hardening`
  reported 9 completed tasks and all strict checks passed.
- Focused regression test result:
  `.agents/scripts/.venv/bin/python -m unittest discover -s .agents/scripts/tests -p 'test_verify_tasks_strict.py'`
  ran 43 tests and passed.

## Completion Gate

- [x] Task exists and tracks the executable work
- [x] No step exists only to make another plan or do generic research
- [x] Relevant prior knowledge was searched or explicitly ruled out
- [x] Any optional artifact created for this workstream is `final` or not
  required
- [x] The ExecPlan remains self-contained enough for a new contributor to resume
- [x] Progress entries reflect the actual current state
- [x] Validation path is concrete enough to execute without guesswork

---

*Template: `docs/templates/plan.md`*
