---
doc_type: plan
id: 260404_0843_workflow-manifest-externalization_plan_01
theme: workflow-manifest-externalization
status: final
owners:
- orchestrator
created_at: 2026-04-04 08:43:39-03:00
updated_at: '2026-04-04T08:51:20-03:00'
roadmap_feature: F-11
parent_spec: 260323_1752_workflow-and-bootstrap-integration_spec_01
child_spec: null
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  brainstorm: 260404_0843_workflow-manifest-externalization_brainstorm_01
  explorer_check: 260404_0843_workflow-manifest-externalization_explorer-check_01
  research: 260404_0843_workflow-manifest-externalization_research_01
  task: 260404_0843_workflow-manifest-externalization_task_01
repo: agentic_start_folder
branch: feat/scaffold-runtime-governance-hardening
---

# Plan: workflow-manifest-externalization

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current as work proceeds. Follow `PLANS.md` from the repository root when writing or revising this file.

## Purpose / Big Picture
- Move the `agents new` artifact sequence from code-only defaults to a config-backed declarative manifest without changing the current CLI contract.
- Success means operators can still run `.agents/agents new ...` the same way, while maintainers can inspect and evolve the generated artifact set through configuration instead of editing a hardcoded pipeline.

## Progress
- [x] 2026-04-04 11:43Z - Compared OpenSpec workflow mechanics against the scaffold and landed the first internal manifest refactor.
- [x] 2026-04-04 11:43Z - Externalized the workstream artifact manifest into config-backed data without changing the generated artifact contract.
- [x] 2026-04-04 11:48Z - Updated operator-facing docs and standards to point at the manifest contract in `.agents/agents.config`.
- [x] 2026-04-04 11:55Z - Re-ran focused verification for `agents new` and recorded the evidence in the report.

## Surprises & Discoveries
- Observation: the repo already had enough config plumbing in `lib/agents_config.py` to support this slice; the larger gap was only that `agents-new.py` still owned the artifact list inline.
  Evidence: `.agents/scripts/lib/agents_config.py` deep-merges defaults with `.agents/agents.config`, and `.agents/scripts/agents-new.py` now has an internal manifest that can be lifted into config.

## Decision Log
- Decision: keep the roadmap linkage under `F-11` / `260323_1752_workflow-and-bootstrap-integration_spec_01` for this slice.
  Rationale: the implementation changes workflow/bootstrap behavior without introducing a second governance tree, which matches the child spec's boundaries.
  Date/Author: 2026-04-04 / orchestrator

## Outcomes & Retrospective
- Outcome: the second slice landed. The `agents new` artifact sequence is now driven by `workflow.artifact_manifest` in `.agents/agents.config`, mirrored by loader defaults, and consumed directly by `agents-new.py`.
- Outcome: command docs and standards now describe the manifest contract as the canonical source of truth.
- Remaining: a later slice can add dependency/status semantics on top of the manifest without introducing a parallel workflow tree.
- Lesson: OpenSpec's strongest reusable idea here is schema/manifest semantics, not its directory tree.

## Governance Context
- Roadmap feature: `F-11`
- Parent spec: `260323_1752_workflow-and-bootstrap-integration_spec_01`
- Child spec: ``
- Planning rule:
  - Do not redefine feature philosophy here; use this file to plan execution of already-defined intent.
  - A major plan is not complete until brainstorm and explorer-check artifacts exist and are linked here.

## Planning Inputs
- Brainstorm artifact: `260404_0843_workflow-manifest-externalization_brainstorm_01`
- Explorer check artifact: `260404_0843_workflow-manifest-externalization_explorer-check_01`
- Research artifact: `260404_0843_workflow-manifest-externalization_research_01`
- Knowledge lookup performed:
  - Reviewed `docs/arc/GENERAL-ROADMAP.md`, `docs/arc/SPECS/260323_1752_workflow-and-bootstrap-integration_spec_01.md`, `docs/arc/SPECS/260306_artifact-resolution-layer_spec_01.md`, and the OpenSpec clone under `.agents/tmp/OpenSpec`.

## Context and Orientation
- `.agents/scripts/agents-new.py` creates governed workbench sessions and currently owns the artifact-generation flow for brainstorm/research/explorer-check/plan/task/spec/log/report/postmortem.
- `.agents/scripts/lib/agents_config.py` is the canonical config loader and deep-merges defaults with `.agents/agents.config`.
- `.agents/agents.config` is the project-local operational config surface; this slice should prefer extending it rather than adding a parallel workflow file elsewhere.
- `docs/agentic/agents-new.md` and standards docs are the operator-facing contract for the command.

## Scope
- In scope:
  - Move the `agents-new` artifact manifest from code-only defaults into config-backed data.
  - Preserve existing flags, filenames, and generated artifact order.
  - Update command docs to reflect the config-backed manifest.
- Out of scope:
  - Introducing a second governance tree or a new `openspec/`-style workflow surface.
  - Redesigning all workbench artifact types or replacing workbench sessions.
  - Generalizing the entire scaffold into a multi-schema workflow engine in one pass.

## Plan of Work
- Extend `.agents/agents.config` and `lib/agents_config.py` with a config-backed representation of the workstream artifact manifest, using safe defaults so existing repos keep working.
- Update `.agents/scripts/agents-new.py` to read from the config-backed manifest and continue rendering artifacts through the existing helper path.
- Tighten targeted tests around manifest selection and config loading, then align command documentation and usage docs with the new source of truth.

## Concrete Steps
1. Update config/loader and `agents-new.py` to accept a declarative `workflow.artifact_manifest` contract.
2. Update tests and docs while preserving CLI behavior.
3. Validate with focused unit/integration coverage for `agents new`.

## Interfaces and Dependencies
- Tools:
  - `.agents/agents new`
  - `.agents/agents wb-update touch`
- MCPs:
  - `rag-docs`
  - `repo-analysis`
- Skills:
  - `workbench-agent-teams`
- Files and interfaces that must exist at the end:
  - `.agents/scripts/lib/agents_config.py`
  - `.agents/scripts/agents-new.py`
  - `.agents/agents.config`
  - `docs/agentic/agents-new.md`

## Risks and Mitigations
- Risk: config externalization breaks repos that rely on implicit defaults -> Mitigation: keep defaults in loader and treat config override as optional.
- Risk: docs drift again because behavior is now partly config-driven -> Mitigation: document the manifest contract and update usage docs in the same slice.

## Validation and Acceptance
- Unit: `uv run --with pyyaml python .agents/scripts/tests/test_agents_new_quick_mode.py`
- E2E: `uv run --with pyyaml --with pytest python -m pytest -q .agents/scripts/tests/integration/test_critical_workflows.py -k new_quick_workflow`
- Typecheck: `python3 -m py_compile .agents/scripts/agents-new.py`
- Lint: `make lint` if the slice broadens beyond targeted command/docs changes
- Behavioral acceptance:
  - `.agents/agents new ...` still creates the same artifact set and names by default.
  - Maintainers can inspect the artifact sequence in config instead of only in script internals.

## Idempotence and Recovery
- State which steps are safe to re-run.
- If a step can fail halfway, document how to retry or recover cleanly.

## Artifacts and Notes
- Delegated agents:
  - `Rawls` owns code/config/test changes on the `agents-new` path using `gpt-5.3-codex-spark`.
  - `Feynman` owns config/doc contract updates using `gpt-5.4-mini`.

## Completion Gate
- [x] Brainstorm exists and reflects real option analysis
- [x] Explorer check proves current-project inspection happened
- [x] Relevant prior knowledge was searched or explicitly ruled out
- [x] The ExecPlan remains self-contained enough for a new contributor to resume
- [x] Progress entries reflect the actual current state
- [x] Validation path is concrete enough to execute without guesswork

---
*Template: `docs/templates/plan.md`*
