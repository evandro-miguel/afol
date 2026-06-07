---
doc_type: plan
id: 260528_1913_command-parity-gate-hardening_plan_01
theme: command-parity-gate-hardening
status: active
owners:
- orchestrator
workstream_intent: delivery
artifact_purpose: Define the concrete execution path for work that will actually be
  performed.
created_at: 2026-05-28 19:13:36-03:00
updated_at: '2026-05-29T16:36:37-03:00'
roadmap_feature: F-17
parent_spec: 260413_1849_just-command-runner-migration_spec_01
child_spec: 260528_1913_command-parity-gate-hardening_spec-child_01
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  task: 260528_1913_command-parity-gate-hardening_task_01
  brainstorm: null
  explorer_check: null
  research: null
  postmortem: null
repo: agentic_start_folder_dev_refactor_TS
branch: dev_refactor_TS
output_artifacts:
  primary:
    plan: 260528_1913_command-parity-gate-hardening_plan_01
    task: 260528_1913_command-parity-gate-hardening_task_01
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

# Plan: command-parity-gate-hardening

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

- Explain what this change enables for a user or operator.
- State how someone can see the new behavior working after implementation.
- `plan + task` is the required execution core for non-trivial work.
- This template is for direct execution. Do not add steps whose only purpose
  is to create another plan, gather broad context, or run generic research.

## Execution Contract

- Every step must be an action an agent can execute now.
- If discovery is still needed, do it before the plan or reduce it to the
  smallest blocking proof.
- Do not use the plan to restate feature philosophy; keep that in roadmap/spec.
- If a step cannot be executed without more framing, rewrite it until it names
  a concrete deliverable, decision, or verification.

## Progress

- [ ] YYYY-MM-DD HH:MMZ - Replace this line with the first concrete step.
- [x] 2026-05-28 22:13Z - Created governed F-17 session, child spec, and started `T-01`.
- [x] 2026-05-28 22:17Z - Implemented aggregate gate-hardening (`all-strict`, `diff-check`, root `validate-strict`) and standards mirror updates.
- [x] 2026-05-28 22:29Z - Ran required validations, recorded closure evidence, and completed `T-01` (evidence: `E-20260528191749129580`, `E-20260528192937709986`).

## Surprises & Discoveries

- Observation: `./.agents/agents new` hard-failed because `F-17` was missing from `docs/arc/GENERAL-ROADMAP.md`.
  Evidence: CLI output `Roadmap feature not found in docs/arc/GENERAL-ROADMAP.md: F-17`.

## Decision Log

- Decision: Restore the missing F-17 roadmap heading before governed session creation.
  Rationale: Canonical workbench flow enforces roadmap feature existence for standard workstreams.
  Date/Author: 2026-05-28 / Codex
- Decision: Keep `just all` stable and add stricter governed closure gate as `just all-strict`.
  Rationale: Preserve aggregate parity while adding opt-in hardening for closure checks.
  Date/Author: 2026-05-28 / Codex

## Outcomes & Retrospective

- Outcome: Command parity and gate-hardening patch implemented in Justfile/doc mirrors with governed artifact linkage.
- Outcome: Required validation and strict closure evidence captured; task state is `done`.
- Lesson: Roadmap/spec drift can block governed session creation even when parent spec exists.

## Governance Context

- Roadmap feature: `F-17`
- Parent spec: `260413_1849_just-command-runner-migration_spec_01`
- Child spec: `260528_1913_command-parity-gate-hardening_spec-child_01`
- Planning rule:
  - Do not redefine feature philosophy here; use this file to plan execution of already-defined intent.
  - This plan must describe the direct execution path for the requested work, not pre-planning or generic research tasks.
  - Brainstorm, explorer-check, and research artifacts are optional sidecars only when they are the requested deliverable or the smallest blocking proof before safe execution.

## Planning Inputs

- Task artifact: `260528_1913_command-parity-gate-hardening_task_01` (required)
- Brainstorm artifact: `` (optional)
- Explorer check artifact: `` (optional)
- Research artifact: `` (optional)
- Postmortem artifact: `` (optional)
- Knowledge lookup performed:
  - `./.agents/agents knowledge pull "F-17 just-command-runner-migration"` -> no reusable knowledge found.

## Context and Orientation

- Describe the current state as if the reader knows nothing about this repo.
- Name the key files, modules, and commands by full repository-relative path.
- Define any non-obvious terms immediately.

## Scope

- In scope:
  - Harden aggregate validation commands in root/standards Justfiles.
  - Align `scripts-reference` and `agents-usage` command mirrors with live behavior.
  - Close governed task with strict session verification evidence.
- Out of scope:
  - Runtime/package code modifications.
  - MCP registration/tooling surface changes.

## Plan of Work

- Describe, in prose, the sequence of edits and additions.
- For each area, name the file and the concrete location to change.
- Keep the path minimal and outcome-focused.
- Do not add a phase whose only purpose is broad research, context gathering, or creating a later plan.
- If a discovery step is unavoidable, make it the smallest blocking proof and
  state the decision or artifact it must produce.

## Concrete Steps

1. Update `docs/standards/Justfile` to add `diff-check` and `all-strict` gate target while keeping `all` as parity alias.
2. Add root alias `validate-strict` in `Justfile` and update `docs/standards/scripts-reference.md` plus `docs/standards/agents-usage.md` to mirror real command behavior.
3. Run required gates: `just lint`, `just all`, `git diff --check`, `./.agents/agents verify-tasks --strict .agents/wb/260528_1913_command-parity-gate-hardening`; then complete task with evidence.

## Interfaces and Dependencies

- Tools:
  - `just`
  - `git`
- MCPs:
  - N/A
- Skills:
  - `agentic-folder-sys`
  - `code-discovery`
  - `docs-operations`
  - `doc-standards`
- Files and interfaces that must exist at the end:
  - `Justfile` with root strict alias.
  - `docs/standards/Justfile` with `diff-check` and `all-strict`.
  - Standards docs reflecting `check` and strict aggregate gate behavior.

## Risks and Mitigations

- Risk: strict aggregate gate could be confused as routine development path -> Mitigation: retain `just all` semantics and document `all-strict` as governed closure path.

## Validation and Acceptance

- Unit: N/A
- E2E: N/A
- Typecheck: N/A
- Lint: `just lint`
- Behavioral acceptance:
  - `just all` passes with unchanged aggregate validation behavior.
  - `just all-strict` is available and resolves to aggregate + diff + strict-session checks.
  - docs mirror the live command surface.

## Idempotence and Recovery

- State which steps are safe to re-run.
- If a step can fail halfway, document how to retry or recover cleanly.

## Artifacts and Notes

- Capture the most important snippets, transcripts, or evidence references here.
- Keep examples concise and focused on proving success.

## Completion Gate

- [ ] Task exists and tracks the executable work
- [ ] No step exists only to make another plan or do generic research
- [ ] Relevant prior knowledge was searched or explicitly ruled out
- [ ] Any optional artifact created for this workstream is `final`
- [ ] The ExecPlan remains self-contained enough for a new contributor to resume
- [ ] Progress entries reflect the actual current state
- [ ] Validation path is concrete enough to execute without guesswork

---

*Template: `docs/templates/plan.md`*
