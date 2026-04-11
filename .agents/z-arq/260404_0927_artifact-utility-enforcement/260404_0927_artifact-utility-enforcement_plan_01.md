---
doc_type: plan
id: 260404_0927_artifact-utility-enforcement_plan_01
theme: artifact-utility-enforcement
status: final
owners:
- orchestrator
workstream_intent: delivery
artifact_purpose: Define the execution path for making artifact creation intent-based
  and utility-aware.
created_at: 2026-04-04 09:27:02-03:00
updated_at: '2026-04-04T10:07:35-03:00'
roadmap_feature: F-08
parent_spec: 260306_context-driven-execution-commands_spec_01
child_spec: null
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  brainstorm: 260404_0927_artifact-utility-enforcement_brainstorm_01
  explorer_check: 260404_0927_artifact-utility-enforcement_explorer-check_01
  research: 260404_0927_artifact-utility-enforcement_research_01
  task: 260404_0927_artifact-utility-enforcement_task_01
repo: agentic_start_folder
branch: feat/scaffold-runtime-governance-hardening
---

# Plan: artifact-utility-enforcement

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current as work proceeds. Follow `PLANS.md` from the repository root when writing or revising this file.

## Purpose / Big Picture
- Make the scaffold receptive to the actual shape of the work instead of forcing a package of workbench files.
- A user should be able to create a delivery session with only `task`, create research-only sessions without `plan/task`, and see placeholder-only artifacts flagged as invalid.

## Progress
- [x] 2026-04-04 09:27Z - Opened the governed session and mapped the current creation/readiness flow.
- [x] 2026-04-04 09:34Z - Collected mini + spark analyses on over-creation and weak verification.
- [x] 2026-04-04 09:45Z - Implemented artifact policy, utility analysis, and intent-aware status/context changes.
- [x] 2026-04-04 10:14Z - Reduced default delivery/closure seeds, added conservative intent inference, updated docs, and passed the full validation batch.

## Surprises & Discoveries
- Observation: `make new` was still pinned to the old package-default UX even after the script layer became more flexible.
  Evidence: `docs/standards/Makefile` only forwarded `SPEC`/`CHILD_SPEC` and had no `INTENT` or `WITH`.
- Observation: strict verification returned early when a session had no task files, which would let research-only placeholder artifacts slip through.
  Evidence: `verify_session()` used an early return on `not task_files` before strict checks were executed.

## Decision Log
- Decision: Keep `artifact_manifest` as the catalog and introduce `artifact_policy` beside it instead of overloading one structure.
  Rationale: The user requirement is about why artifacts may exist, not just what order they are listed in.
  Date/Author: 2026-04-04 / Codex
- Decision: Treat placeholder-only artifacts as semantically invalid instead of merely “draft”.
  Rationale: The failure mode to prevent is fake progress from empty files with upgraded status.
  Date/Author: 2026-04-04 / Codex

## Outcomes & Retrospective
- Outcome: The code path now supports intent-based creation, utility-aware readiness, and smaller default workstreams (`delivery` seeds `task`; `closure` seeds `report`).
- Outcome: Conservative theme-based inference now prevents obvious research/brainstorm/exploration/closure requests from silently becoming delivery sessions.
- Outcome: `make all` completed successfully after docs, tests, and session evidence were aligned.
- Lesson: A manifest without a policy still pushes agents toward package-default behavior; a policy without minimal defaults still creates unnecessary files.

## Governance Context
- Roadmap feature: `F-08`
- Parent spec: `260306_context-driven-execution-commands_spec_01`
- Child spec: ``
- Planning rule:
  - Do not redefine feature philosophy here; use this file to plan execution of already-defined intent.
  - A major plan is not complete until brainstorm and explorer-check artifacts exist and are linked here.

## Planning Inputs
- Brainstorm artifact: `260404_0927_artifact-utility-enforcement_brainstorm_01`
- Explorer check artifact: `260404_0927_artifact-utility-enforcement_explorer-check_01`
- Research artifact: `260404_0927_artifact-utility-enforcement_research_01`
- Knowledge lookup performed:
  - Reviewed the previous `artifact-manifest-readiness` work and searched the current repo for manifest/readiness usage before editing.

## Context and Orientation
- `agents-new.py` creates or extends workstreams under `.agents/wb/`.
- `workflow_manifest.py` now holds the artifact catalog and the default intent policy.
- `execution_commands.py` powers `status`, `session catchup`, and task execution helpers.
- `verify-tasks.py` is the strict closure gate, so utility enforcement must land there too.

## Scope
- In scope:
  - Intent-based artifact selection for `agents-new.py`
  - Semantic utility checks in readiness and strict verification
  - Makefile/docs alignment with the new creation model
- Out of scope:
  - Replacing the workbench template catalog
  - Designing a new session UI outside the existing CLI surface

## Plan of Work
- Introduce policy defaults beside the artifact catalog, then make `agents-new.py` select artifacts from policy instead of creating the full package.
- Add a cheap semantic utility analyzer and wire it into readiness and strict verification so placeholder-only artifacts stop counting as valid.
- Update the Makefile and canonical docs so the user-facing path matches the code path.

## Concrete Steps
1. Edit `.agents/scripts/lib/workflow_manifest.py` and `.agents/scripts/lib/agents_config.py` to add intent policy defaults and artifact purposes.
2. Edit `.agents/scripts/agents-new.py`, `.agents/scripts/lib/execution_commands.py`, `.agents/scripts/verify-tasks.py`, and `.agents/scripts/agents-review.py` to consume policy and utility state.
3. Update tests, docs, and the governed session; then run `make lint`, targeted suites, and `make all`.

## Interfaces and Dependencies
- Tools:
  - `make`
  - `pytest`
  - `rg`
- MCPs:
  - none required for the final implementation pass
- Skills:
  - `workbench-agent-teams`
  - `code-discovery`
- Files and interfaces that must exist at the end:
  - `.agents/scripts/lib/workflow_manifest.py`
  - `.agents/scripts/lib/artifact_utility.py`
  - `.agents/scripts/agents-new.py`
  - `.agents/scripts/lib/execution_commands.py`
  - `.agents/scripts/verify-tasks.py`

## Risks and Mitigations
- Risk: Old tests and docs still assume package-default creation -> Mitigation: update wrappers/docs and run the full script suite.
- Risk: Sessions without task files might bypass strict checks -> Mitigation: keep strict verification running utility checks even for research-only sessions.

## Validation and Acceptance
- Unit: targeted Python test suites under `.agents/scripts/tests/`
- E2E: N/A
- Typecheck: `python3 -m py_compile ...`
- Lint: `make lint`
- Behavioral acceptance:
  - `./.agents/agents new ... --intent research` creates only research artifacts by default.
  - Placeholder-only artifacts show as `invalid` instead of `ready` or `done`.
  - Strict verification fails if a completed delivery session has no useful report.

## Idempotence and Recovery
- Tests and lint are safe to re-run.
- If `make all` regenerates indexes or maps, review the generated diffs and keep them when they reflect current code reality.

## Artifacts and Notes
- Mini + spark analyses converged on the same diagnosis: over-creation plus weak semantic validation.
- The Makefile wrapper needed a follow-up patch to expose `INTENT` and `WITH`, or the CLI fix would stay partially hidden.

## Completion Gate
- [x] Brainstorm exists and reflects real option analysis
- [x] Explorer check proves current-project inspection happened
- [x] Relevant prior knowledge was searched or explicitly ruled out
- [x] The ExecPlan remains self-contained enough for a new contributor to resume
- [x] Progress entries reflect the actual current state
- [x] Validation path is concrete enough to execute without guesswork

---
*Template: `docs/templates/plan.md`*
