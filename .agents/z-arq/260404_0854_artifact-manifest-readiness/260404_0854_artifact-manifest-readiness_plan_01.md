---
doc_type: plan
id: 260404_0854_artifact-manifest-readiness_plan_01
theme: artifact-manifest-readiness
status: final
owners:
- orchestrator
created_at: 2026-04-04 08:54:11-03:00
updated_at: '2026-04-04T09:07:39-03:00'
roadmap_feature: F-08
parent_spec: 260306_context-driven-execution-commands_spec_01
child_spec: 260306_artifact-resolution-layer_spec_01
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  brainstorm: 260404_0854_artifact-manifest-readiness_brainstorm_01
  explorer_check: 260404_0854_artifact-manifest-readiness_explorer-check_01
  research: 260404_0854_artifact-manifest-readiness_research_01
  task: 260404_0854_artifact-manifest-readiness_task_01
repo: agentic_start_folder
branch: feat/scaffold-runtime-governance-hardening
---

# Plan: artifact-manifest-readiness

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current as work proceeds. Follow `PLANS.md` from the repository root when writing or revising this file.

## Purpose / Big Picture
- Make the workflow artifact manifest useful beyond file creation by adding explicit dependency semantics and manifest-backed readiness reporting.
- Eliminate markdown lint noise from disposable workspaces so `make lint` and `make all` report real repository issues instead of imported/tmp content.

## Progress
- [x] 2026-04-04 11:54Z - Created the governed workstream under F-08 / artifact-resolution-layer and scoped the implementation to lint exclusions plus manifest readiness.
- [x] 2026-04-04 12:05Z - Added a shared `workflow_manifest.py` helper, moved manifest normalization there, and wired `agents-new.py` and `execution_commands.py` to the same contract.
- [x] 2026-04-04 12:11Z - Added manifest dependency metadata, `agents-status` readiness output, and tmp/raw-artifact lint exclusions with targeted tests.
- [x] 2026-04-04 12:20Z - Re-ran `make lint` and `make all`; both passed cleanly.

## Surprises & Discoveries
- Observation: `.agents/tmp/` was already present in project config, but the linter compared it against a normalized relative path shaped as `tmp/...`, so the exclusion never matched.
  Evidence: `make lint` initially reported hundreds of warnings from `.agents/tmp/OpenSpec/**`; after path normalization and tmp-segment exclusion, `make lint` dropped to 3 historical warnings, then to 0 after aligning `.agents/arc/map/extra/`.
- Observation: `resolve_artifact("spec")` intentionally falls back to `spec-lite`, but manifest readiness must inspect exact files or it will double-count the optional spec variant.
  Evidence: `./.agents/agents status --session .agents/wb/260404_0854_artifact-manifest-readiness --json` initially showed both `spec` and `spec-lite` for the same file until the manifest state code switched to exact pattern resolution.

## Decision Log
- Decision: move manifest coercion/defaults into `lib/workflow_manifest.py` instead of duplicating the same contract in every command.
  Rationale: creation and status flows now need the same semantics; shared code reduces drift and keeps config-backed behavior explicit.
  Date/Author: 2026-04-04 / orchestrator
- Decision: treat repo-local `tmp` workspaces and raw codemap evidence as lint-excluded by default.
  Rationale: those surfaces are non-canonical or machine-generated; they should not count as markdown debt.
  Date/Author: 2026-04-04 / orchestrator

## Outcomes & Retrospective
- Outcome: the workflow artifact manifest is now shared, dependency-aware, and used by `agents-status` to report readiness/blockers in manifest order.
- Outcome: markdown lint now ignores `.agents/tmp/`, `.tmp/`, repo-local `tmp/`, and `.agents/arc/map/extra/`, so imported or generated surfaces no longer pollute validation.
- Remaining: no code work remains in this slice; the next independent improvement would be richer dependency satisfaction rules than the current non-draft heuristic.
- Lesson: when a config exclusion exists but lint still reports the path, inspect normalization on both sides before changing the config contract.

## Governance Context
- Roadmap feature: `F-08`
- Parent spec: `260306_context-driven-execution-commands_spec_01`
- Child spec: `260306_artifact-resolution-layer_spec_01`
- Planning rule:
  - Do not redefine feature philosophy here; use this file to plan execution of already-defined intent.
  - A major plan is not complete until brainstorm and explorer-check artifacts exist and are linked here.

## Planning Inputs
- Brainstorm artifact: `260404_0854_artifact-manifest-readiness_brainstorm_01`
- Explorer check artifact: `260404_0854_artifact-manifest-readiness_explorer-check_01`
- Research artifact: `260404_0854_artifact-manifest-readiness_research_01`
- Knowledge lookup performed:
  - Reviewed `docs/arc/GENERAL-ROADMAP.md`, `docs/arc/SPECS/260306_context-driven-execution-commands_spec_01.md`, `docs/arc/SPECS/260306_artifact-resolution-layer_spec_01.md`, the prior session `260404_0843_workflow-manifest-externalization`, and current lint/status code paths.

## Context and Orientation
- `/.agents/scripts/agents-new.py` creates governed workstreams from templates and configuration.
- `/.agents/scripts/lib/execution_commands.py` holds shared resolver/status/catchup helpers used by the command layer.
- `/.agents/scripts/agents-status.py` is the read-only session status command for operators and runtimes.
- `/.agents/scripts/agents-lint-docs.py` is the canonical markdown lint command used by `make lint`.
- `/.agents/agents.config` is the project-local source of truth for lint exclusions and workflow artifact ordering.
- In this slice, "manifest readiness" means deriving which artifacts are ready, blocked, missing, or done from the manifest order plus declared dependencies.

## Scope
- In scope:
  - Fixing markdown lint so repo-local tmp workspaces are always excluded.
  - Adding dependency metadata to the workflow artifact manifest.
  - Surfacing manifest-backed readiness in `agents-status`.
  - Updating tests and operator docs for the new contract.
- Out of scope:
  - Replacing the workbench model with an OpenSpec-style directory tree.
  - Implementing a full schema engine or custom workflow DSL.
  - Changing the `agents new` CLI contract for operators.

## Plan of Work
- First, fix the lint scope at the source by normalizing exclusion matching in `/.agents/scripts/agents-lint-docs.py` and aligning config defaults in `/.agents/agents.config` and `/.agents/scripts/lib/agents_config.py`.
- Second, extract manifest normalization/defaults into a shared helper so `agents-new.py` and status/execution helpers read the same contract.
- Third, extend status summarization to compute manifest-backed artifact readiness and blockers without duplicating optional spec variants.
- Finally, update tests, docs, and generated indexes/maps, then run repo-wide validation.

## Concrete Steps
1. Patch lint exclusion matching and config defaults for tmp/raw-artifact paths.
2. Add `/.agents/scripts/lib/workflow_manifest.py` and migrate `agents-new.py` / `execution_commands.py` to it.
3. Extend `agents-status.py` and tests, then run `make lint` and `make all`.

## Interfaces and Dependencies
- Tools:
  - `.agents/agents lint-docs`
  - `.agents/agents status --json`
  - `make lint`
  - `make all`
- MCPs:
  - none
- Skills:
  - `workbench-agent-teams`
- Files and interfaces that must exist at the end:
  - `/.agents/scripts/lib/workflow_manifest.py`
  - `/.agents/scripts/agents-lint-docs.py`
  - `/.agents/scripts/agents-status.py`
  - `/.agents/scripts/lib/execution_commands.py`
  - `/.agents/agents.config`

## Risks and Mitigations
- Risk: shared manifest extraction breaks isolated script/test environments -> Mitigation: add the helper to integration test fixture copies and keep bootstrap/exported script trees whole.
- Risk: manifest readiness duplicates optional artifacts -> Mitigation: filter optional `flag`-gated entries to only the variant actually present in the session.

## Validation and Acceptance
- Unit: `uv run --with pyyaml python .agents/scripts/tests/test_agents_lint_noise_reduction.py`, `uv run --with pyyaml python .agents/scripts/tests/test_agents_new_quick_mode.py`, `uv run --with pyyaml python .agents/scripts/tests/test_execution_command_scenarios.py`, `uv run --with pyyaml python .agents/scripts/tests/test_agents_status_summary.py`, `uv run --with pyyaml python .agents/scripts/tests/test_runtime_compatibility.py`
- E2E: `uv run --with pyyaml --with pytest python -m pytest -q .agents/scripts/tests/integration/test_critical_workflows.py -k new_quick_workflow`, `uv run --with pyyaml --with pytest python -m pytest -q .agents/scripts/tests/integration/test_critical_workflows.py -k session_catchup_temp_repo_scenarios`
- Typecheck: `python3 -m py_compile .agents/scripts/lib/workflow_manifest.py .agents/scripts/agents-new.py .agents/scripts/agents-lint-docs.py .agents/scripts/lib/execution_commands.py .agents/scripts/agents-status.py`
- Lint: `make lint`
- Behavioral acceptance:
  - `./.agents/agents status --session .agents/wb/260404_0854_artifact-manifest-readiness --json` reports `workflow_artifacts` and `workflow_next` based on manifest dependencies.
  - `make lint` reports `Issues found: 0`.
  - `make all` ends with `All validations passed`.

## Idempotence and Recovery
- `make lint`, `make all`, and all targeted test commands are safe to re-run.
- If `make all` fails in the script suite, re-run the failing pytest selector first, then rerun the full target after the fix to restore a full evidence trail.

## Artifacts and Notes
- Key files changed:
  - `/.agents/scripts/lib/workflow_manifest.py`
  - `/.agents/scripts/agents-lint-docs.py`
  - `/.agents/scripts/agents-status.py`
  - `/.agents/scripts/lib/execution_commands.py`
  - `/.agents/agents.config`
- Key repo docs changed:
  - `/README.md`
  - `/docs/agentic/agents-config.md`
  - `/docs/agentic/agents-new.md`
  - `/docs/standards/agents-usage.md`
  - `/docs/standards/scripts-usage.md`

## Completion Gate
- [x] Brainstorm exists and reflects real option analysis
- [x] Explorer check proves current-project inspection happened
- [x] Relevant prior knowledge was searched or explicitly ruled out
- [x] The ExecPlan remains self-contained enough for a new contributor to resume
- [x] Progress entries reflect the actual current state
- [x] Validation path is concrete enough to execute without guesswork

---
*Template: `docs/templates/plan.md`*
