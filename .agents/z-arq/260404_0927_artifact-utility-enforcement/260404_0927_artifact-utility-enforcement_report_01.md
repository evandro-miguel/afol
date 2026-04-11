---
doc_type: report
id: 260404_0927_artifact-utility-enforcement_report_01
theme: artifact-utility-enforcement
status: final
created_at: '2026-04-04T09:27:02-03:00'
updated_at: '2026-04-04T10:07:35-03:00'
roadmap_feature: F-08
parent_spec: 260306_context-driven-execution-commands_spec_01
child_spec: ''
related_tasks:
- T-01
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  plan: 260404_0927_artifact-utility-enforcement_plan_01
  task: 260404_0927_artifact-utility-enforcement_task_01
  postmortem: 260404_0927_artifact-utility-enforcement_postmortem_01
---

# Report: artifact-utility-enforcement

## Governance Context
- Roadmap feature: `F-08`
- Parent spec: `260306_context-driven-execution-commands_spec_01`
- Child spec: ``

## Summary
- Reworked the scaffold so artifact creation is driven by justified intent and actual utility instead of package-default templates.
- Hardened readiness and strict verification so placeholder-only artifacts are treated as invalid and completed work requires useful closure artifacts.

## Delivered Changes
- Added shared artifact policy support plus semantic utility analysis for workbench docs.
- Changed `agents-new.py` so default delivery creation seeds only `task`, default closure creation seeds only `report`, and obvious research/brainstorm/exploration/closure themes infer a safer intent automatically.
- Updated `execution_commands`, `agents-review`, and `verify-tasks` so missing vs invalid artifacts are distinguished semantically and minimal delivery sessions are accepted without forcing a plan.
- Updated tests, standards docs, agentic docs, README, and the session-pack/postmortem spec to match the minimal artifact model.

## Files Changed
- `.agents/scripts/lib/workflow_manifest.py`
- `.agents/scripts/lib/artifact_utility.py`
- `.agents/scripts/agents-new.py`
- `.agents/scripts/lib/execution_commands.py`
- `.agents/scripts/agents-review.py`
- `.agents/scripts/verify-tasks.py`
- `.agents/scripts/lib/agents_config.py`
- `.agents/agents.config`
- `.agents/scripts/tests/test_agents_new_quick_mode.py`
- `.agents/scripts/tests/test_execution_command_scenarios.py`
- `.agents/scripts/tests/integration/test_critical_workflows.py`
- `README.md`
- `docs/agentic/agents-new.md`
- `docs/agentic/agents-config.md`
- `docs/standards/agents-usage.md`
- `docs/standards/scripts-usage.md`
- `docs/standards/scripts-reference.md`
- `docs/arc/SPECS/260306_session-pack-structure-and-postmortem_spec_01.md`

## Verification
- Unit tests: `uv run --with pyyaml python .agents/scripts/tests/test_agents_new_quick_mode.py` -> pass -> Evidence: `11 tests` passed after the delivery-default reduction and intent inference changes.
- Unit/integration batch: `uv run --with pyyaml --with pytest python -m pytest -q .agents/scripts/tests/test_execution_command_scenarios.py .agents/scripts/tests/test_agents_status_summary.py .agents/scripts/tests/test_execution_command_flow.py .agents/scripts/tests/integration/test_critical_workflows.py` -> pass -> Evidence: `44 passed` covering readiness, review, catchup, and integration behavior.
- Typecheck: `python3 -m py_compile .agents/scripts/agents-new.py .agents/scripts/agents-review.py .agents/scripts/lib/execution_commands.py .agents/scripts/lib/workflow_manifest.py .agents/scripts/lib/agents_config.py` -> pass -> Evidence: no syntax errors.
- Lint: `make lint` -> pass -> Evidence: markdown lint reported `Issues found: 0`.
- Full validation: `make all` -> pass -> Evidence: structure validation, map/index refresh, tool smoke, telemetry validation, and `177 passed` in the full script suite.
- Additional checks:
  - Specialist review (`mini` + `spark`) -> pass -> Evidence: both identified the same over-creation gap, which is now covered by minimal defaults plus utility-aware gates.

## Risks / Follow-ups
- Intent inference is conservative on purpose; if future teams want broader inference, it should remain opt-in or add stronger heuristics backed by tests.
- A later slice may add explicit lazy materialization helpers for `postmortem` and similar artifacts during session close, but this round already removes the main default over-creation.

## Postmortem Link
- Postmortem: `260404_0927_artifact-utility-enforcement_postmortem_01`

## Lessons (if any)
- Artifact policy must govern necessity, not just ordering; otherwise the scaffold still manufactures low-value files that look “complete” without helping execution.

---
*Template: `docs/templates/report.md`*
