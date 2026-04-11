---
doc_type: report
id: 260402_1505_skills-sync-git-publish_report_01
theme: skills-sync-git-publish
status: final
created_at: '2026-04-02T15:05:32-03:00'
updated_at: '2026-04-02T15:21:55-03:00'
roadmap_feature: F-10
parent_spec: 260323_1704_universal-skills-runtime-integration_spec_01
child_spec: ''
related_tasks:
- T-01
- T-02
- T-03
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260402_1505_skills-sync-git-publish_plan_01
  task: 260402_1505_skills-sync-git-publish_task_01
  postmortem: 260402_1505_skills-sync-git-publish_postmortem_01
---

# Report: skills-sync-git-publish

## Governance Context
- Roadmap feature: `F-10`
- Parent spec: `260323_1704_universal-skills-runtime-integration_spec_01`
- Child spec: ``

## Summary
- `skills-sync` now supports git-backed refresh for seed-based downstream repos
  through a mirror, exposes `update` as a clearer alias for the one-step sync
  flow, and adds `push` for explicit publication of selected local skills.

## Delivered Changes
- Added git mirror support in `.agents/cache/universal-skills` for `pull` and `sync/update` when `.agents/source/universal-skills` is only a local seed.
- Added `skills-sync push` with explicit `--commit` / `--push`.
- Added `skills-sync update` plus `make skills-update` and `make skills-push`.
- Updated README, AGENTS, tool catalog, and canonical skills docs to match the new contract.

## Files Changed
- `.agents/scripts/agents-skills-sync.py`
- `.agents/scripts/tests/test_agents_skills_sync.py`
- `.agents/a-docs/standards/Makefile`
- `.agents/tools.json`
- `README.md`
- `AGENTS.md`
- `OPENCODE.md`
- `QWEN.md`
- `CLAUDE.md`
- `GEMINI.md`
- `.agents/a-docs/standards/skills-sync.md`
- `.agents/a-docs/agentic/agents-skills-sync.md`
- `.agents/a-docs/standards/scripts-reference.md`
- `.agents/a-docs/standards/agents-usage.md`
- `.agents/scripts/README.md`
- `.agents/skills/README.md`
- `.agents/templates/AGENTS_TEMPLATE.md`
- `.agents/a-docs/standards/bootstrap-other-repo.md`

## Verification
- Unit tests: `uv run --project .agents/scripts pytest .agents/scripts/tests/test_agents_skills_sync.py -q` -> pass -> Evidence: `15 passed`
- E2E tests: `N/A` -> pass -> Evidence: no browser/E2E surface changed
- Typecheck: `N/A` -> pass -> Evidence: Python scaffold has no separate typecheck gate
- Lint: `make all` -> pass -> Evidence: markdown lint `Issues found: 0`, Ruff `All checks passed!`
- Additional checks:
  - `make all` -> pass -> Evidence: `158 passed in 4.81s` and final banner `✓ All validations passed`

## Risks / Follow-ups
- `skills-sync push` currently targets `origin/<ref>` directly. A later pass can add branch/PR ergonomics if needed.

## Postmortem Link
- Postmortem: `260402_1505_skills-sync-git-publish_postmortem_01`

## Lessons (if any)
- In a local-first scaffold, a git mirror is the cleanest way to add on-demand remote refresh without rewriting the seed contract.
