---
doc_type: plan
id: 260528_0814_f04-workbench-core-smoke_plan_01
theme: f04-workbench-core-smoke
status: active
owners:
- orchestrator
workstream_intent: delivery
artifact_purpose: Define the concrete execution path for work that will actually be
  performed.
created_at: 2026-05-28 08:14:45-03:00
updated_at: '2026-05-30T17:20:07-03:00'
roadmap_feature: F-04
parent_spec: 260521_0040_governance-workbench-system_spec_01
child_spec: null
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  task: 260528_0814_f04-workbench-core-smoke_task_01
  brainstorm: null
  explorer_check: null
  research: null
  postmortem: null
repo: agentic_start_folder_dev_refactor_TS
branch: dev_refactor_TS
output_artifacts:
  primary:
    plan: 260528_0814_f04-workbench-core-smoke_plan_01
    task: 260528_0814_f04-workbench-core-smoke_task_01
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

# Plan: f04-workbench-core-smoke

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

- Validate that the F-04 governed workbench core can create a session, start a
  task, complete it with evidence, and survive strict verification.
- Operators can see the smoke result through the session task state and
  `.evidence.jsonl` entry for `T-01`.

## Execution Contract

- Use only the governed workbench CLI flow for this smoke session.
- Do not create optional sidecars for this smoke unless a blocking finding
  requires them.
- Close the task only through task-scoped evidence.

## Progress

- [x] 2026-05-28 08:14-03 - Created the F-04 workbench-core smoke session.
- [x] 2026-05-28 08:14-03 - Started `T-01` through `implement start`.
- [x] 2026-05-28 08:14-03 - Completed `T-01` through `implement complete` with
  evidence `E-20260528081453830842`.

## Surprises & Discoveries

- Observation: Optional sidecars were not needed for this smoke.
  Evidence: The session completed with plan, task, log, report, and one
  task-scoped evidence entry.

## Decision Log

- Decision: Keep this session to the minimum F-04 smoke surface.
  Rationale: The goal was to prove the core lifecycle, not produce additional
  planning or research artifacts.
  Date/Author: 2026-05-28 08:14-03 / orchestrator

## Outcomes & Retrospective

- Outcome: F-04 workbench core lifecycle was exercised with a completed task
  and task-scoped evidence.
- Remaining: N/A for this smoke session.
- Lesson: Smoke sessions should leave optional sidecar links empty when the
  sidecars are not created.

## Governance Context

- Roadmap feature: `F-04`
- Parent spec: `260521_0040_governance-workbench-system_spec_01`
- Child spec: ``
- Planning rule:
  - Do not redefine feature philosophy here; use this file to plan execution of already-defined intent.
  - This plan must describe the direct execution path for the requested work, not pre-planning or generic research tasks.
  - Brainstorm, explorer-check, and research artifacts are optional sidecars only when they are the requested deliverable or the smallest blocking proof before safe execution.

## Planning Inputs

- Task artifact: `260528_0814_f04-workbench-core-smoke_task_01` (required)
- Brainstorm artifact: `` (optional)
- Explorer check artifact: `` (optional)
- Research artifact: `` (optional)
- Postmortem artifact: `` (optional)
- Knowledge lookup performed:
  - `implement start`, `implement complete`, and strict task verification were
    the relevant local evidence for this smoke.

## Context and Orientation

- The workbench core is the `.agents/wb/` session lifecycle used by governed
  delivery.
- This session validates the minimal path: plan/task session, task start,
  evidence-backed completion, and strict verification.

## Scope

- In scope:
  - Smoke the F-04 workbench lifecycle for session/task/evidence closure.
- Out of scope:
  - Product code changes.
  - Optional brainstorm, research, explorer-check, or postmortem sidecars.

## Plan of Work

- Create the governed session, start `T-01`, complete `T-01` through the
  implement CLI so `.evidence.jsonl` records closure evidence, then verify the
  session strictly.

## Concrete Steps

1. Run `./.agents/agents implement start --session 260528_0814_f04-workbench-core-smoke --task-id T-01`.
2. Run `./.agents/agents implement complete --session 260528_0814_f04-workbench-core-smoke --task-id T-01 --command "smoke: implement complete" --result passed --artifact .agents/wb/260528_0814_f04-workbench-core-smoke/260528_0814_f04-workbench-core-smoke_task_01.md`.
3. Run `./.agents/agents verify-tasks --strict .agents/wb/260528_0814_f04-workbench-core-smoke`.

## Interfaces and Dependencies

- Tools:
  - `./.agents/agents implement`
  - `./.agents/agents verify-tasks`
- MCPs:
  - N/A
- Skills:
  - `agentic-folder-sys`
- Files and interfaces that must exist at the end:
  - `.agents/wb/260528_0814_f04-workbench-core-smoke/260528_0814_f04-workbench-core-smoke_task_01.md`
  - `.agents/wb/260528_0814_f04-workbench-core-smoke/.evidence.jsonl`

## Risks and Mitigations

- Risk: Sidecar links point to artifacts that were not created. -> Mitigation:
  leave optional sidecar references empty and mark them `not_required`.

## Validation and Acceptance

- Unit: N/A for smoke-only workbench lifecycle validation.
- E2E: `./.agents/agents verify-tasks --strict .agents/wb/260528_0814_f04-workbench-core-smoke`
- Typecheck: N/A
- Lint: N/A
- Behavioral acceptance:
  - `T-01` is `done` with evidence `E-20260528081453830842`.
  - Strict verification accepts the session.

## Idempotence and Recovery

- Strict verification is read-only and safe to rerun.
- The implement completion command is append-only and should not be repeated
  unless a new evidence record is intentionally needed.

## Artifacts and Notes

- Evidence ledger entry: `E-20260528081453830842` for `T-01`.

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
