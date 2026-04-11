---
doc_type: report
id: 260402_1613_scaffold-ops-skill_report_01
theme: scaffold-ops-skill
status: final
created_at: '2026-04-02T16:13:52-03:00'
updated_at: '2026-04-02T16:49:35-03:00'
roadmap_feature: F-10
parent_spec: 260323_1704_universal-skills-runtime-integration_spec_01
child_spec: ''
related_tasks:
- T-01
- T-02
- T-03
- T-04
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260402_1613_scaffold-ops-skill_plan_01
  task: 260402_1613_scaffold-ops-skill_task_01
  postmortem: 260402_1613_scaffold-ops-skill_postmortem_01
---

# Report: scaffold-ops-skill

## Governance Context
- Roadmap feature: `F-10`
- Parent spec: `260323_1704_universal-skills-runtime-integration_spec_01`
- Child spec: ``

## Summary
- The scaffold-operating skill is now the canonical local entrypoint for
  bootstrap, upgrade, validation, and git-backed skill operations. The runtime
  now distinguishes correctly between repo-local seed semantics and git-backed
  catalog semantics, keeps the local source metadata coherent, and lets full
  bootstrap create a missing target directory.

## Delivered Changes
- Expanded `agentic-system-workflow` and related docs so agents can operate the
  scaffold through a single local skill.
- Hardened `agents-skills-sync.py` to reject inconsistent local sources,
  generate coherent local seed metadata, prefer the git catalog for
  list/search/ensure when available, and combine `default_profile` with
  explicit `default_skills`.
- Hardened `agents-bootstrap.py` so full bootstrap can create a missing target
  directory while `--partial` stays strict.
- Reseeded `.agents/source/universal-skills` so the committed local source is
  internally consistent and passes `skills-sync check`.

## Files Changed
- `.agents/scripts/agents-skills-sync.py`
- `.agents/scripts/agents-bootstrap.py`
- `.agents/scripts/tests/test_agents_skills_sync.py`
- `.agents/scripts/tests/test_runtime_compatibility.py`
- `.agents/skills/agentic-system-workflow/SKILL.md`
- `.agents/skills/agentic-system-workflow/references/troubleshooting/README.md`
- `.agents/skills/agentic-system-workflow/gotchas.md`
- `.agents/skills-sync.manifest.json`
- `.agents/source/universal-skills/`
- `.agents/a-docs/standards/skills-sync.md`
- `.agents/a-docs/standards/bootstrap-other-repo.md`
- `.agents/a-docs/agentic/agents-skills-sync.md`
- `.agents/scripts/README.md`
- `README.md`

## Verification
- Unit tests: `uv run --project .agents/scripts pytest .agents/scripts/tests/test_agents_skills_sync.py -q` -> pass -> Evidence: `20 passed`
- E2E tests: `N/A` -> pass -> Evidence: no browser surface changed
- Typecheck: `N/A` -> pass -> Evidence: Python scaffold has no separate typecheck gate
- Lint: `make all` -> pass -> Evidence: markdown lint `Issues found: 0` and Ruff `All checks passed!`
- Additional checks:
  - `uv run --project .agents/scripts pytest .agents/scripts/tests/test_runtime_compatibility.py -q` -> pass -> Evidence: `17 passed`
  - `./.agents/agents skills-sync check` -> pass -> Evidence: `PASS: skills structure and sync are valid`
  - `bun .agents/skills/writing-skills/scripts/check-universal-skills-sync.js --skill agentic-system-workflow,writing-skills` -> pass -> Evidence: three `STATUS: PASS` blocks
  - `make all` -> pass -> Evidence: `164 passed in 4.37s` and final banner `All validations passed`

## Risks / Follow-ups
- A future round can still add a thinner CLI like `init-project` / `upgrade-framework`, but this is now a UX improvement rather than a correctness blocker.

## Postmortem Link
- Postmortem: `260402_1613_scaffold-ops-skill_postmortem_01`

## Lessons (if any)
- When a repo-local source represents only a subset of the upstream catalog,
  local metadata must be synthesized from the subset instead of copied blindly
  from the upstream mirror.

---
*Template: `.agents/a-docs/templates/report.md`*
