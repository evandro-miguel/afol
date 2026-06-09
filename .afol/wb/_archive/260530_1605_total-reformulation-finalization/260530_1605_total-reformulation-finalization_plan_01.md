---
doc_type: plan
id: 260530_1605_total-reformulation-finalization_plan_01
theme: total-reformulation-finalization
status: final
owners:
- orchestrator
workstream_intent: delivery
artifact_purpose: Define the concrete execution path for work that will actually be
  performed.
created_at: 2026-05-30 16:05:48-03:00
updated_at: '2026-05-30T16:14:10-03:00'
roadmap_feature: F-00
parent_spec: 260521_0000_total-reformulation-strategy_spec_01
child_spec: null
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  task: 260530_1605_total-reformulation-finalization_task_01
  brainstorm: null
  explorer_check: null
  research: null
  postmortem: null
repo: agentic_start_folder_dev_refactor_TS
branch: dev_refactor_TS
output_artifacts:
  primary:
    plan: 260530_1605_total-reformulation-finalization_plan_01
    task: 260530_1605_total-reformulation-finalization_task_01
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

# Plan: total-reformulation-finalization

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

- Close the remaining governance drift that prevents the total reformulation
  worktree from presenting a coherent final state.
- Operators should see no stale in-progress F-09 sessions, F-00 should match the
  already accepted strategy package, and the active finalization session should
  pass strict verification.

## Execution Contract

- Every step must be an action an agent can execute now.
- If discovery is still needed, do it before the plan or reduce it to the
  smallest blocking proof.
- Do not use the plan to restate feature philosophy; keep that in roadmap/spec.
- If a step cannot be executed without more framing, rewrite it until it names
  a concrete deliverable, decision, or verification.

## Progress

- [x] 2026-05-30 19:05Z - Created governed finalization session and started
  `T-01`.
- [x] 2026-05-30 19:07Z - Reconciled duplicate F-09 sessions to the accepted
  F-09 closeout evidence.
- [x] 2026-05-30 19:10Z - Updated F-00 strategy status from planned/draft to
  final.
- [x] 2026-05-30 19:13Z - Recorded focused-gate evidence and aggregate
  `just validate-strict` evidence.

## Surprises & Discoveries

- Observation: `verify-tasks --strict .agents/wb` is not the release gate used
  by `just all-strict`; the project gate verifies the active session strictly.
  Evidence: `docs/standards/Justfile` defines `all-strict` as
  `agents-all diff-check verify-strict-if-present`.

## Decision Log

- Decision: reconcile duplicate F-09 sessions to the accepted closeout instead
  of reopening F-09 implementation.
  Rationale: the roadmap and canonical F-09 closeout already identify accepted
  implementation evidence; the stale sessions were governance drift.
  Date/Author: 2026-05-30 / Codex

- Decision: close F-00 as final.
  Rationale: its acceptance criteria are strategy artifacts and feature specs,
  and those artifacts now exist with downstream implementation closeouts.
  Date/Author: 2026-05-30 / Codex

## Outcomes & Retrospective

- Outcome: finalization changes reconcile strategy and workbench state.
- Remaining: run gates, record evidence, and commit if the final diff is clean.
- Lesson: project finalization must separate product implementation gaps from
  stale governance artifacts.

## Governance Context

- Roadmap feature: `F-00`
- Parent spec: `260521_0000_total-reformulation-strategy_spec_01`
- Child spec: ``
- Planning rule:
  - Do not redefine feature philosophy here; use this file to plan execution of already-defined intent.
  - This plan must describe the direct execution path for the requested work, not pre-planning or generic research tasks.
  - Brainstorm, explorer-check, and research artifacts are optional sidecars only when they are the requested deliverable or the smallest blocking proof before safe execution.

## Planning Inputs

- Task artifact: `260530_1605_total-reformulation-finalization_task_01` (required)
- Brainstorm artifact: `` (optional)
- Explorer check artifact: `` (optional)
- Research artifact: `` (optional)
- Postmortem artifact: `` (optional)
- Knowledge lookup performed:
  - Memory summary and `MEMORY.md` total-reformulation entries were checked.
  - `.agents/agents session list`, `verify-tasks`, and roadmap/spec files were
    checked against live repo state.

## Context and Orientation

- This repository is the TypeScript/Bun reformulation worktree for the
  `.agents` scaffold.
- The accepted feature portfolio is described in `docs/arc/GENERAL-ROADMAP.md`.
- Workbench state lives under `.agents/wb/`.
- The active product diff exposes scaffold management commands through `./a` in
  `cli/main.ts` and `cli/tests/kernel.test.ts`.

## Scope

- In scope:
  - Reconcile stale F-09 workbench sessions.
  - Mark F-00 strategy docs final when their acceptance criteria are met.
  - Validate the active finalization session and current CLI diff.
- Out of scope:
  - Rewriting legacy active specs unrelated to the total reformulation closeout.
  - Pushing or merging without an explicit user request.

## Plan of Work

- Patch the two stale F-09 plans/tasks to point at the canonical F-09 closeout.
- Update F-00 strategy status in the parent spec and roadmap.
- Refresh generated spec indexes after docs status changes.
- Run the CLI tests, typecheck, whitespace check, strict session verification,
  and command help smoke checks.

## Concrete Steps

1. `./.agents/agents verify-tasks --strict .agents/wb/260528_2137_f09-closeout`.
2. `./.agents/agents wb-update evidence ...` for the stale F-09 sessions.
3. Patch F-00 status and finalization workbench artifacts.
4. Run `./.agents/agents index`, `bun test`, `bun run typecheck`,
   `git diff --check`, and strict verification for this session.

## Interfaces and Dependencies

- Tools:
  - `./.agents/agents`
  - `bun`
  - `git`
- MCPs:
  - N/A
- Skills:
  - `agentic-orchestrator`
  - `agentic-folder-sys`
  - `git-skill`
- Files and interfaces that must exist at the end:
  - `docs/arc/GENERAL-ROADMAP.md`
  - `docs/arc/SPECS/260521_0000_total-reformulation-strategy_spec_01.md`
  - `.agents/wb/260530_1605_total-reformulation-finalization/`

## Risks and Mitigations

- Risk: closing stale sessions could hide real implementation gaps ->
  Mitigation: evidence points to the canonical F-09 closeout, and no product
  behavior is claimed without existing accepted evidence.
- Risk: broad legacy active specs distract from finalization -> Mitigation:
  leave unrelated legacy specs untouched and document the F-00 strategy closure
  only.

## Validation and Acceptance

- Unit: `bun test`
- E2E: N/A
- Typecheck: `bun run typecheck`
- Lint: `git diff --check`
- Behavioral acceptance:
  - `./a adoption-plan --help` and `./a inspect-target --help` exit 0.
  - `./.agents/agents verify-tasks --strict .agents/wb/260530_1605_total-reformulation-finalization`
    passes.

## Idempotence and Recovery

- Verification commands are safe to rerun.
- If a stale-session reconciliation is rejected, reopen that session's `T-01`
  and remove the reconciliation evidence in a follow-up patch.

## Artifacts and Notes

- Canonical F-09 closeout:
  `.agents/wb/260528_2137_f09-closeout/260528_2137_f09-closeout_report_01.md`.
- Evidence:
  `E-20260530161228477984`, `E-20260530161317593358`.

## Completion Gate

- [x] Task exists and tracks the executable work
- [x] No step exists only to make another plan or do generic research
- [x] Relevant prior knowledge was searched or explicitly ruled out
- [x] Any optional artifact created for this workstream is `final`
- [x] The ExecPlan remains self-contained enough for a new contributor to resume
- [x] Progress entries reflect the actual current state
- [x] Validation path is concrete enough to execute without guesswork

---

*Template: `docs/templates/plan.md`*
