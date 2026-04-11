---
doc_type: report
id: 260323_1407_bootstrap-generic-export_report_01
theme: bootstrap-generic-export
status: final
created_at: '2026-03-23T14:07:57-03:00'
updated_at: '2026-03-23T14:18:47-03:00'
roadmap_feature: F-04
parent_spec: 260306_roadmap-first-delivery-system_spec_01
child_spec: ''
related_tasks:
- <optional_task_id>
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260323_1407_bootstrap-generic-export_plan_01
  task: 260323_1407_bootstrap-generic-export_task_01
  postmortem: 260323_1407_bootstrap-generic-export_postmortem_01
---

# Report: bootstrap-generic-export

## Governance Context
- Roadmap feature: `F-04`
- Parent spec: `260306_roadmap-first-delivery-system_spec_01`
- Child spec: ``

## Summary
- Bootstrap now exports a generic downstream-project baseline instead of leaking this scaffold's local governance history.
- Fresh target repos receive starter roadmap/spec docs that pass post-bootstrap validation.

## Delivered Changes
- Sanitized `agents-bootstrap.py` so copied `a-docs` content excludes scaffold-local knowledge indexes, lesson entries, and telemetry reports.
- Replaced copied live `arc` backlog/spec state with generated starter governance docs, including valid parent specs and empty/generic indexes.
- Added runtime regression tests and updated canonical bootstrap documentation.

## Files Changed
- `.agents/scripts/agents-bootstrap.py`
- `.agents/scripts/tests/test_runtime_compatibility.py`
- `.agents/a-docs/agentic/agents-bootstrap.md`
- `.agents/a-docs/standards/agents-usage.md`
- `.agents/a-docs/standards/scripts-reference.md`
- `.agents/scripts/README.md`
- `README.md`
- `.agents/a-docs/lessons/entries/20260323_1420_bootstrap-must-export-generic-project-state.md`

## Verification
- Unit tests: `make test-scripts` -> pass -> Evidence: `118 passed, 6 deselected`
- E2E tests: `./.agents/agents bootstrap <tmpdir>` -> pass -> Evidence: fresh target completed setup, doctor, lint, and test-scripts successfully
- Typecheck: `N/A` -> pass -> Evidence: scaffold has no standalone typecheck phase
- Lint: `make lint && make lint-scripts` -> pass -> Evidence: markdown and Python lint both clean
- Additional checks:
  - `make doctor` -> pass -> Evidence: only one pre-existing info on an old workbench ID convention
  - `make all` -> pass -> Evidence: aggregate validation completed successfully
  - `PATH=/usr/bin:/bin ./.agents/agents doctor` -> pass -> Evidence: wrapper still runs correctly without `uv` on `PATH`
  - `cd .agents/scripts && ./.venv/bin/pytest tests/integration/test_critical_workflows.py -v` -> pass -> Evidence: `6 passed`

## Risks / Follow-ups
- Optional upstream skill content can still surface markdown warnings in target repos, but those warnings are non-fatal and did not block bootstrap success.

## Postmortem Link
- Postmortem: `260323_1407_bootstrap-generic-export_postmortem_01`

## Lessons (if any)
- See `.agents/a-docs/lessons/entries/20260323_1420_bootstrap-must-export-generic-project-state.md`

---
*Template: `.agents/a-docs/templates/report.md`*
