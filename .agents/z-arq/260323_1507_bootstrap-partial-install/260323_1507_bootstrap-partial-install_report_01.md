---
doc_type: report
id: 260323_1507_bootstrap-partial-install_report_01
theme: bootstrap-partial-install
status: final
created_at: '2026-03-23T15:07:03-03:00'
updated_at: '2026-03-23T15:24:34-03:00'
roadmap_feature: F-04
parent_spec: 260306_roadmap-first-delivery-system_spec_01
child_spec: ''
related_tasks:
- T-01
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260323_1507_bootstrap-partial-install_plan_01
  task: 260323_1507_bootstrap-partial-install_task_01
  postmortem: 260323_1507_bootstrap-partial-install_postmortem_01
---

# Report: bootstrap-partial-install

## Governance Context
- Roadmap feature: `F-04`
- Parent spec: `260306_roadmap-first-delivery-system_spec_01`
- Child spec: ``

## Summary
- Added explicit partial-install support for existing projects and removed bootstrap-specific target warnings so fresh and partial installs validate cleanly.

## Delivered Changes
- `agents-bootstrap.py` now supports `--partial` and generates an adoption-oriented roadmap/spec baseline for already-running projects.
- `agents-doctor.py` no longer warns about a missing active-session pointer when a bootstrapped target has no sessions yet.
- Markdown lint now excludes synced skill docs because those imported artifacts are covered by `skills-check`.
- Partial installs now preserve a repo-owned `make all`; the scaffold aggregate target is exposed as `make agents-all` in that scenario.
- Documentation and Makefile usage now expose the partial-install path explicitly.

## Files Changed
- `.agents/scripts/agents-bootstrap.py`
- `.agents/scripts/agents-doctor.py`
- `.agents/agents.config`
- `.agents/scripts/tests/test_runtime_compatibility.py`
- `.agents/scripts/tests/test_agents_doctor_fix.py`
- `.agents/a-docs/standards/Makefile`
- `.agents/a-docs/agentic/agents-bootstrap.md`
- `.agents/a-docs/standards/agents-usage.md`
- `.agents/a-docs/standards/scripts-reference.md`
- `.agents/a-docs/standards/bootstrap-other-repo.md`
- `.agents/scripts/README.md`
- `README.md`
- `.agents/wb/260224_1253_execution-integrity-hardening/260224_1253_execution-integrity-hardening_operational-policy_01.md`

## Verification
- Unit tests: `make test-scripts` -> pass -> Evidence: `123 passed, 6 deselected`
- E2E tests: `./.agents/agents bootstrap <tmpdir>` and `./.agents/agents bootstrap <tmpdir> --partial` -> pass -> Evidence: both fresh and existing-project installs completed with clean target `doctor`/`lint`
- Typecheck: `N/A` -> pass -> Evidence: no standalone typecheck phase in this scaffold
- Lint: `make lint && make lint-scripts` -> pass -> Evidence: markdown and Python lint both clean
- Additional checks:
  - `make doctor` -> pass -> Evidence: local repo now reports `✅ No issues found!`
  - `make all` -> pass -> Evidence: aggregate validation completed successfully in the scaffold repo
  - `PATH=/usr/bin:/bin ./.agents/agents doctor` -> pass -> Evidence: wrapper remains hermetic without `uv` on `PATH`
  - `cd .agents/scripts && ./.venv/bin/pytest tests/integration/test_critical_workflows.py -v` -> pass -> Evidence: `6 passed`
  - Partial-install target Makefile -> pass -> Evidence: repo-owned `all` target stayed intact and no override warning was emitted; scaffold aggregate validation is available as `make agents-all`

## Risks / Follow-ups
- Existing-project partial installs still require humans to replace the adoption placeholders with the real backlog/specs before non-trivial work begins.

## Postmortem Link
- Postmortem: `260323_1507_bootstrap-partial-install_postmortem_01`

## Lessons (if any)
- Reuse `.agents/a-docs/lessons/entries/20260323_1420_bootstrap-must-export-generic-project-state.md` for bootstrap sanitization.

---
*Template: `.agents/a-docs/templates/report.md`*
