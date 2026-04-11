---
doc_type: report
id: 260402_1448_dead-surface-cleanup_report_01
theme: dead-surface-cleanup
status: final
created_at: '2026-04-02T14:48:32-03:00'
updated_at: '2026-04-02T15:01:53-03:00'
roadmap_feature: F-11
parent_spec: 260323_1741_current-state-maps-and-goal-state-governance_spec_01
child_spec: ''
related_tasks:
- T-01
- T-02
- T-03
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260402_1448_dead-surface-cleanup_plan_01
  task: 260402_1448_dead-surface-cleanup_task_01
  postmortem: 260402_1448_dead-surface-cleanup_postmortem_01
---

# Report: dead-surface-cleanup

## Governance Context
- Roadmap feature: `F-11`
- Parent spec: `260323_1741_current-state-maps-and-goal-state-governance_spec_01`
- Child spec: ``

## Summary
- Removed dead tracked scaffold surfaces, corrected the test strategy to the
  real current suite, refreshed generated structure docs, and passed full repo
  validation.

## Delivered Changes
- Deleted `.agents/scripts/migrate-task-board.py`.
- Deleted placeholder test assets under `.agents/scripts/tests/e2e/` and `.agents/scripts/tests/test_data/`.
- Removed the unused bootstrap source-contract loader from `.agents/scripts/agents-bootstrap.py`.
- Rewrote `.agents/scripts/tests/TEST_STRATEGY.md` to match the committed suite.
- Regenerated `.agents/arc/structure/` after the tree cleanup.

## Files Changed
- `.agents/scripts/agents-bootstrap.py`
- `.agents/scripts/tests/TEST_STRATEGY.md`
- `.agents/scripts/tests/conftest.py`
- `.agents/scripts/migrate-task-board.py`
- `.agents/scripts/tests/e2e/__init__.py`
- `.agents/scripts/tests/test_data/scenarios.yaml`
- `.agents/arc/structure/README.md`
- `.agents/arc/structure/backend.md`
- `.agents/arc/structure/data.md`
- `.agents/arc/structure/tests.md`
- `.agents/arc/structure/types.md`
- `README.md`

## Verification
- Unit tests: `make all` -> pass -> Evidence: `154 passed in 4.12s`
- E2E tests: `N/A` -> pass -> Evidence: no committed E2E suite exists in this repo
- Typecheck: `N/A` -> pass -> Evidence: Python scaffold does not define a separate typecheck gate
- Lint: `make all` -> pass -> Evidence: markdown lint reported `Issues found: 0` and Ruff reported `All checks passed!`
- Additional checks:
  - `uv run --project .agents/scripts python .agents/scripts/agents-structure-map.py . --output .agents/arc/structure/` -> pass -> Evidence: regenerated structure docs with the deleted file references removed

## Risks / Follow-ups
- Compatibility-cache content under `.agents/cache/universal-skills` still needs a separate, higher-confidence retirement pass.

## Postmortem Link
- Postmortem: `260402_1448_dead-surface-cleanup_postmortem_01`

## Lessons (if any)
- Refresh generated inventories in the same slice whenever a cleanup deletes tracked files from the repository tree.

---
*Template: `.agents/a-docs/templates/report.md`*
