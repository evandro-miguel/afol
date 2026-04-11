---
doc_type: report
id: 260404_0843_workflow-manifest-externalization_report_01
theme: workflow-manifest-externalization
status: final
created_at: '2026-04-04T08:43:39-03:00'
updated_at: '2026-04-04T08:51:43-03:00'
roadmap_feature: F-11
parent_spec: 260323_1752_workflow-and-bootstrap-integration_spec_01
child_spec: ''
related_tasks:
- T-01
- T-02
- T-03
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  plan: 260404_0843_workflow-manifest-externalization_plan_01
  task: 260404_0843_workflow-manifest-externalization_task_01
  postmortem: 260404_0843_workflow-manifest-externalization_postmortem_01
---

# Report: workflow-manifest-externalization

## Governance Context
- Roadmap feature: `F-11`
- Parent spec: `260323_1752_workflow-and-bootstrap-integration_spec_01`
- Child spec: ``

## Summary
- `agents new` now reads a config-backed declarative artifact manifest from `.agents/agents.config` instead of relying only on a hardcoded file-creation chain in `agents-new.py`.
- The generated artifact order, optional spec gating, and placeholder mapping stayed behavior-compatible with the prior implementation.
- Operator-facing docs and standards now point to the manifest contract as the source of truth for workstream generation.

## Delivered Changes
- Added `workflow.artifact_manifest` to [`.agents/agents.config`](/home/ozy/apps/agentic_start_folder/.agents/agents.config) and mirrored safe fallback defaults in [`.agents/scripts/lib/agents_config.py`](/home/ozy/apps/agentic_start_folder/.agents/scripts/lib/agents_config.py).
- Refactored [`.agents/scripts/agents-new.py`](/home/ozy/apps/agentic_start_folder/.agents/scripts/agents-new.py) to coerce, filter, and render artifacts from the declarative manifest.
- Expanded [`.agents/scripts/tests/test_agents_new_quick_mode.py`](/home/ozy/apps/agentic_start_folder/.agents/scripts/tests/test_agents_new_quick_mode.py) with manifest-order and fallback coverage.
- Updated [agents-new.md](/home/ozy/apps/agentic_start_folder/docs/agentic/agents-new.md), [agents-usage.md](/home/ozy/apps/agentic_start_folder/docs/standards/agents-usage.md), and [scripts-usage.md](/home/ozy/apps/agentic_start_folder/docs/standards/scripts-usage.md) to describe the manifest-backed contract.

## Verification
- Unit tests:
  - `uv run --with pyyaml python .agents/scripts/tests/test_agents_new_quick_mode.py` -> pass -> `Ran 9 tests in 0.055s` and `OK`
- Integration tests:
  - `uv run --with pyyaml --with pytest python -m pytest -q .agents/scripts/tests/integration/test_critical_workflows.py -k new_quick_workflow` -> pass -> `1 passed, 5 deselected`
- Typecheck:
  - `python3 -m py_compile .agents/scripts/agents-new.py .agents/scripts/lib/agents_config.py .agents/scripts/tests/test_agents_new_quick_mode.py` -> pass -> exited cleanly with no output
- Lint:
  - `make lint` -> pass -> final summary `Errors: 0`, `Warnings: 398`
- Additional checks:
  - `git diff -- .agents/agents.config .agents/scripts/lib/agents_config.py .agents/scripts/agents-new.py .agents/scripts/tests/test_agents_new_quick_mode.py docs/agentic/agents-new.md docs/standards/agents-usage.md docs/standards/scripts-usage.md` -> pass -> code and docs point to the same manifest contract

## Risks / Follow-ups
- The next meaningful extraction from OpenSpec is not another directory tree; it is adding manifest-level dependencies and artifact status semantics on top of this contract.
- `make lint` still reports a large warning backlog from temporary OpenSpec clone content under `.agents/tmp/OpenSpec`, but the current slice introduced no lint errors.

## Postmortem Link
- Postmortem: `260404_0843_workflow-manifest-externalization_postmortem_01`

## Lessons (if any)
- When importing ideas from OpenSpec, keep the scaffold's workbench/runtime split intact and extract only the declarative workflow mechanics that fit the existing governance model.

---
*Template: `docs/templates/report.md`*
