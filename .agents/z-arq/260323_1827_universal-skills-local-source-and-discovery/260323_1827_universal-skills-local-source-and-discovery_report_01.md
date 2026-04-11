---
doc_type: report
id: 260323_1827_universal-skills-local-source-and-discovery_report_01
theme: universal-skills-local-source-and-discovery
status: final
created_at: '2026-03-23T18:27:53-03:00'
updated_at: '2026-03-23T19:07:53-03:00'
roadmap_feature: F-10
parent_spec: 260323_1704_universal-skills-runtime-integration_spec_01
child_spec: ''
related_tasks:
- T-01
- T-02
- T-03
- T-05
- T-06
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260323_1827_universal-skills-local-source-and-discovery_plan_01
  task: 260323_1827_universal-skills-local-source-and-discovery_task_01
  postmortem: 260323_1827_universal-skills-local-source-and-discovery_postmortem_01
---

# Report: universal-skills-local-source-and-discovery

## Governance Context
- Roadmap feature: `F-10`
- Parent spec: `260323_1704_universal-skills-runtime-integration_spec_01`
- Child spec: ``

## Summary
- The scaffold now uses `/home/ozy/apps/universal-skills` as the active upstream source checkout, exposes `skills-sync list/search/ensure`, prepares the sibling checkout automatically during bootstrap for `apps/` targets, and no longer keeps overlapping universal-skills copies in the global Codex path or in an extra archive.

## Delivered Changes
- Added preferred sibling source resolution through `skills_sync.source_dir`, with `.agents/cache/universal-skills` retained only as a compatibility fallback.
- Added `skills-sync list`, `skills-sync search`, and `skills-sync ensure`, plus Makefile wrappers `skills-list`, `skills-search`, and `skills-ensure`.
- Added bootstrap-side preparation of `../universal-skills` for targets under `.../apps/<repo>`, including the `--skip-checks` path.
- Updated tests, command docs, standards, and the tools catalog to match the new operator flow.
- Removed 78 overlapping universal-skills directories from `/home/ozy/.codex/skills`; an intermediate archive was created during the first pass and then deleted after user clarification.
- Updated `AGENTS.md` and runtime mirrors to explicitly prefer project-local skills over a large global Codex skill inventory.

## Files Changed
- `.agents/scripts/agents-skills-sync.py`
- `.agents/scripts/tests/test_agents_skills_sync.py`
- `.agents/agents.config`
- `.agents/scripts/lib/agents_config.py`
- `.agents/a-docs/standards/Makefile`
- `.agents/tools.json`
- `README.md`
- `.agents/scripts/README.md`
- `.agents/a-docs/standards/skills-sync.md`
- `.agents/a-docs/agentic/agents-skills-sync.md`
- `.agents/a-docs/standards/scripts-reference.md`
- `.agents/a-docs/standards/agents-usage.md`
- `.agents/scripts/agents-repo-map.py`
- `.agents/scripts/agents-bootstrap.py`
- `.agents/scripts/tests/test_runtime_compatibility.py`
- `.agents/a-docs/agentic/agents-bootstrap.md`
- `.agents/a-docs/standards/bootstrap-other-repo.md`
- `AGENTS.md`
- `.agents/templates/AGENTS_TEMPLATE.md`
- `OPENCODE.md`
- `QWEN.md`
- `CLAUDE.md`
- `GEMINI.md`

## Verification
- Unit tests: `./.agents/scripts/.venv/bin/pytest .agents/scripts/tests/test_agents_skills_sync.py -q` -> pass -> Evidence: `8 passed`
- E2E tests: `./.agents/agents skills-sync status`, `./.agents/agents skills-sync list --runtime codex`, `./.agents/agents skills-sync search markdown --runtime codex`, `./.agents/agents skills-sync ensure writing-skills --runtime codex`, `make skills-list RUNTIME=codex`, `make skills-search QUERY=markdown RUNTIME=codex`, `make skills-ensure SKILL=writing-skills RUNTIME=codex` -> pass -> Evidence: local source path resolved to `/home/ozy/apps/universal-skills` and ensure returned `already installed and aligned`
- Typecheck: `N/A`
- Lint: `make lint` and `make lint-scripts` -> pass -> Evidence: `Issues found: 0`; `All checks passed!`
- Additional checks:
  - `make test-scripts` -> pass -> Evidence: `137 passed, 6 deselected`
  - `make doctor` -> pass -> Evidence: `No issues found`
  - `PATH=/usr/bin:/bin ./.agents/agents doctor` -> pass -> Evidence: hermetic wrapper path still valid
  - `./.agents/agents tools validate` -> pass -> Evidence: `Catalog is valid`
  - `make all` -> pass -> Evidence: `All validations passed`
  - Global Codex cleanup -> pass -> Evidence: `/home/ozy/.codex/skills` contains only non-overlapping custom/system directories, and `/home/ozy/.codex/skills-archive/20260323_1836_universal-skills-global` no longer exists
  - `./.agents/scripts/.venv/bin/pytest .agents/scripts/tests/test_runtime_compatibility.py -q` -> pass -> Evidence: `16 passed`
  - `./.agents/agents sync --force` -> pass -> Evidence: `4 file(s) updated`
  - `./.agents/agents bootstrap <tmp>/apps/demo-repo --skip-checks` -> pass -> Evidence: bootstrap created `<tmp>/apps/universal-skills/.git`

## Risks / Follow-ups
- `skills-sync search` is intentionally keyword-based and can match broad markdown-heavy skill content; add richer metadata search later if `F-10` demands ranking/filtering beyond substring search.
- None from the global cleanup path now that the user-approved deletion policy is explicit.
- Targets outside an `apps/` workspace still rely on the generic `source_dir: ../universal-skills` contract or fallback path; if another workspace layout becomes common, add explicit bootstrap heuristics for it instead of generalizing prematurely.

## Postmortem Link
- Postmortem: `260323_1827_universal-skills-local-source-and-discovery_postmortem_01`

## Lessons (if any)
- Added a lesson noting that when the user explicitly approves deletion of reproducible overlapping assets, do not keep extra archives by default.
- No additional lesson was required for the bootstrap follow-up because it extended the intended `F-10` contract rather than correcting an implementation mistake.

---
*Template: `.agents/a-docs/templates/report.md`*
