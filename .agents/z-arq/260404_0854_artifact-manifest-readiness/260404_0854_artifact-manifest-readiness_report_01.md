---
doc_type: report
id: 260404_0854_artifact-manifest-readiness_report_01
theme: artifact-manifest-readiness
status: final
created_at: '2026-04-04T08:54:11-03:00'
updated_at: '2026-04-04T09:07:39-03:00'
roadmap_feature: F-08
parent_spec: 260306_context-driven-execution-commands_spec_01
child_spec: 260306_artifact-resolution-layer_spec_01
related_tasks:
- T-01
- T-02
- T-03
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  plan: 260404_0854_artifact-manifest-readiness_plan_01
  task: 260404_0854_artifact-manifest-readiness_task_01
  postmortem: 260404_0854_artifact-manifest-readiness_postmortem_01
---

# Report: artifact-manifest-readiness

## Governance Context
- Roadmap feature: `F-08`
- Parent spec: `260306_context-driven-execution-commands_spec_01`
- Child spec: `260306_artifact-resolution-layer_spec_01`

## Summary
- The workflow artifact manifest is now a shared contract used by both creation and status flows, with explicit dependency metadata and manifest-backed readiness reporting.
- Markdown lint now ignores `.agents/tmp/`, `.tmp/`, repo-local `tmp/`, and raw codemap evidence under `.agents/arc/map/extra/`, so imported/disposable content no longer creates false warning noise.

## Delivered Changes
- Added [workflow_manifest.py](/home/ozy/apps/agentic_start_folder/.agents/scripts/lib/workflow_manifest.py) and moved manifest normalization/defaults out of [agents-new.py](/home/ozy/apps/agentic_start_folder/.agents/scripts/agents-new.py).
- Extended [execution_commands.py](/home/ozy/apps/agentic_start_folder/.agents/scripts/lib/execution_commands.py) and [agents-status.py](/home/ozy/apps/agentic_start_folder/.agents/scripts/agents-status.py) to compute and display manifest-backed artifact readiness/blockers.
- Fixed lint exclusion matching in [agents-lint-docs.py](/home/ozy/apps/agentic_start_folder/.agents/scripts/agents-lint-docs.py) and aligned canonical exclusions in [`.agents/agents.config`](/home/ozy/apps/agentic_start_folder/.agents/agents.config) and [agents_config.md](/home/ozy/apps/agentic_start_folder/docs/agentic/agents-config.md).
- Added regression coverage in the focused lint, manifest, status, runtime-compatibility, and integration test suites.
- Refreshed operator docs in [README.md](/home/ozy/apps/agentic_start_folder/README.md), [agents-new.md](/home/ozy/apps/agentic_start_folder/docs/agentic/agents-new.md), [agents-usage.md](/home/ozy/apps/agentic_start_folder/docs/standards/agents-usage.md), and [scripts-usage.md](/home/ozy/apps/agentic_start_folder/docs/standards/scripts-usage.md).

## Verification
- Unit tests:
  - `uv run --with pyyaml python .agents/scripts/tests/test_agents_lint_noise_reduction.py` -> pass -> `Ran 4 tests` and `OK`
  - `uv run --with pyyaml python .agents/scripts/tests/test_agents_new_quick_mode.py` -> pass -> `Ran 9 tests` and `OK`
  - `uv run --with pyyaml python .agents/scripts/tests/test_execution_command_scenarios.py` -> pass -> `Ran 23 tests` and `OK`
  - `uv run --with pyyaml python .agents/scripts/tests/test_agents_status_summary.py` -> pass -> `Ran 1 test` and `OK`
  - `uv run --with pyyaml python .agents/scripts/tests/test_runtime_compatibility.py` -> pass -> `Ran 17 tests` and `OK`
- Integration tests:
  - `uv run --with pyyaml --with pytest python -m pytest -q .agents/scripts/tests/integration/test_critical_workflows.py -k new_quick_workflow` -> pass -> `1 passed, 5 deselected`
  - `uv run --with pyyaml --with pytest python -m pytest -q .agents/scripts/tests/integration/test_critical_workflows.py -k session_catchup_temp_repo_scenarios` -> pass -> `1 passed, 5 deselected`
- Typecheck:
  - `python3 -m py_compile .agents/scripts/lib/workflow_manifest.py .agents/scripts/agents-new.py .agents/scripts/agents-lint-docs.py .agents/scripts/lib/execution_commands.py .agents/scripts/agents-status.py .agents/scripts/tests/integration/test_critical_workflows.py` -> pass -> exited cleanly with no output
- Lint:
  - `make lint` -> pass -> `Issues found: 0`
- Additional checks:
  - `./.agents/agents status --session .agents/wb/260404_0854_artifact-manifest-readiness --json` -> pass -> payload includes `workflow_artifacts` and `workflow_next`
  - `make all` -> pass -> `172 passed` and final banner `All validations passed`

## Risks / Follow-ups
- Dependency satisfaction currently treats any non-draft prerequisite as ready. If future workflows need stricter semantics per artifact, extend the shared manifest helper instead of adding command-local heuristics.
- `make all` refreshes generated codemap and knowledge indexes, so downstream diffs may include those updated artifacts even when the main behavioral changes are elsewhere.

## Postmortem Link
- Postmortem: `260404_0854_artifact-manifest-readiness_postmortem_01`

## Lessons (if any)
- Keep tmp/raw-analysis surfaces excluded from markdown lint by default; warning counts should reflect canonical docs only.

---
*Template: `docs/templates/report.md`*
