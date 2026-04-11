---
doc_type: report
id: 260323_1705_universal-skills-runtime-integration_report_01
theme: universal-skills-runtime-integration
status: final
created_at: '2026-03-23T17:05:28-03:00'
updated_at: '2026-03-23T17:25:44-03:00'
roadmap_feature: F-10
parent_spec: 260323_1704_universal-skills-runtime-integration_spec_01
child_spec: ''
related_tasks:
- T-01
- T-02
- T-03
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260323_1705_universal-skills-runtime-integration_plan_01
  task: 260323_1705_universal-skills-runtime-integration_task_01
  postmortem: 260323_1705_universal-skills-runtime-integration_postmortem_01
---

# Report: universal-skills-runtime-integration

## Governance Context
- Roadmap feature: `F-10`
- Parent spec: `260323_1704_universal-skills-runtime-integration_spec_01`
- Child spec: ``

## Summary
- The scaffold now ships a first runtime-aware universal-skills contract for interactive CLI agents. The repo gained a manifest `version: 2` model with `repo/ref/mode/installs`, runtime/profile-aware resolution, migration from the legacy selected-skills manifest, and bootstrap/docs behavior that prepares a generic skills baseline for fresh and partial installs.

## Delivered Changes
- Added roadmap feature `F-10` for universal-skills runtime integration.
- Added parent spec `260323_1704_universal-skills-runtime-integration_spec_01`.
- Created governed workstream `260323_1705_universal-skills-runtime-integration` with execution-ready planning artifacts.
- Reworked `.agents/scripts/agents-skills-sync.py` to support:
  - manifest `version: 2`
  - `repo/ref/mode/installs` contract
  - runtime/app aliases and supported runtime validation
  - profile-based skill resolution from the pool
  - explicit per-runtime skill overrides
  - automatic migration from the legacy `selected_skills` manifest
- Updated `.agents/agents.config` and `.agents/skills-sync.manifest.json` to the new baseline contract.
- Applied the declared core profile to the local repo with `./.agents/agents skills-sync sync --runtime all`, so `skills-check` and `make all` now pass without optional drift warnings.
- Updated bootstrap and runtime docs to describe generic, history-free installs, partial-install behavior, and the skills-baseline adoption model for both fresh and existing repos.
- Added runtime-compatibility coverage and `skills-sync` tests for the new contract.

## Files Changed
- `.agents/arc/GENERAL-ROADMAP.md`
- `.agents/arc/SPECS/260323_1704_universal-skills-runtime-integration_spec_01.md`
- `.agents/scripts/agents-bootstrap.py`
- `.agents/scripts/tests/test_runtime_compatibility.py`
- `README.md`
- `.agents/scripts/README.md`
- `.agents/a-docs/standards/skills-sync.md`
- `.agents/a-docs/agentic/agents-skills-sync.md`
- `.agents/a-docs/standards/agents-usage.md`
- `.agents/a-docs/standards/scripts-reference.md`
- `.agents/a-docs/standards/bootstrap-other-repo.md`
- `.agents/a-docs/agentic/agents-bootstrap.md`
- `.agents/wb/260323_1705_universal-skills-runtime-integration/*`

## Verification
- Unit tests: `pass` -> pass -> Evidence: `./.agents/scripts/.venv/bin/pytest .agents/scripts/tests/test_agents_skills_sync.py -q` returned `5 passed`
- Unit tests: `pass` -> pass -> Evidence: `./.agents/scripts/.venv/bin/pytest .agents/scripts/tests/test_runtime_compatibility.py -q` returned `14 passed`
- E2E tests: `pass` -> pass -> Evidence: `./.agents/agents bootstrap <tmpdir> --skip-checks` and `./.agents/agents bootstrap <existing-tmpdir> --partial --skip-checks` both returned success
- Typecheck: `N/A` -> `N/A` -> Evidence: not applicable in this Python-and-docs scoped change set
- Lint: `pass` -> pass -> Evidence: `make lint` returned success after parent spec cleanup
- Additional checks:
  - `./.agents/agents skills-sync sync --runtime all` -> pass -> Evidence: baseline core profile installed locally and `skills-check` stopped warning about missing skills
  - `make lint-scripts` -> pass -> Evidence: Ruff checks passed
  - `make test-scripts` -> pass -> Evidence: `129 passed, 6 deselected`
  - `make doctor` -> pass -> Evidence: no issues found
  - `make all` -> pass -> Evidence: aggregate scaffold validation completed
  - `./.agents/agents skills-sync status` -> pass -> Evidence: manifest/config loaded successfully with the new contract
  - `workbench planning artifacts` -> pass -> Evidence: brainstorm, explorer-check, research, plan, task, spec-lite, report, and postmortem are filled and linked

## Risks / Follow-ups
- This is the first contract slice, not a full mirror of upstream universal-skills helpers. Future work can add richer lock policies or publish workflows if the roadmap demands them.

## Postmortem Link
- Postmortem: `260323_1705_universal-skills-runtime-integration_postmortem_01`

## Lessons (if any)
- `20260323_1800_orchestrator-must-track-worker-lifecycle-end-to-end`

---
*Template: `.agents/a-docs/templates/report.md`*
