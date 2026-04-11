---
doc_type: explorer-check
id: 260402_1505_skills-sync-git-publish_explorer-check_01
theme: skills-sync-git-publish
status: final
owners:
- explorer
created_at: '2026-04-02T15:05:32-03:00'
updated_at: '2026-04-02T15:21:55-03:00'
roadmap_feature: F-10
parent_spec: 260323_1704_universal-skills-runtime-integration_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  brainstorm: 260402_1505_skills-sync-git-publish_brainstorm_01
  plan: 260402_1505_skills-sync-git-publish_plan_01
---

# Explorer Check: skills-sync-git-publish

## Goal
- Prove the plan was checked against the current project instead of being written from assumptions.

## Scope Reviewed
- Paths inspected:
  - `.agents/scripts/agents-skills-sync.py`
  - `.agents/scripts/tests/test_agents_skills_sync.py`
  - `.agents/a-docs/standards/Makefile`
  - `.agents/tools.json`
- Existing docs inspected:
  - `README.md`
  - `AGENTS.md`
  - `.agents/a-docs/standards/skills-sync.md`
  - `.agents/a-docs/agentic/agents-skills-sync.md`
- Existing scripts/tools checked:
  - `rg`
  - `make all`

## Commands Used
```bash
rg -n "skills-sync|universal-skills|push|publish|git" README.md AGENTS.md .agents/a-docs/standards .agents/a-docs/agentic .agents/templates .agents/scripts/tests
sed -n '1,980p' .agents/scripts/agents-skills-sync.py
uv run --project .agents/scripts pytest .agents/scripts/tests/test_agents_skills_sync.py -q
make all
```

## Findings
- `sync` already was the natural one-step update verb; the real gap was that
  seeded downstream repos could not reach git updates and there was no publish command.
- The active source preference had to stay local-first, so git refresh needed a
  separate mirror path instead of replacing the seeded source.
- The canonical contract surface lives in `README.md`, `AGENTS.md`,
  `.agents/tools.json`, `.agents/a-docs/standards/skills-sync.md`, and
  `.agents/a-docs/agentic/agents-skills-sync.md`.

## Contradictions or Drift Found
- Docs were still describing `pull` as meaningful only for directly git-backed sources.
- There was no documented or implemented publish path for edited local skills.

## Impact on the Plan
- What changed in the plan because of exploration:
  - The implementation centered on `sync/update + push` instead of redefining `pull` as an installer.
  - A git mirror path in `.agents/cache/universal-skills` was added to preserve local-first semantics.
- What remains uncertain:
  - Whether a future pass should expose more source-management verbs beyond `pull/push/update`.

## Readiness
- Plan grounded in current repo state: yes
- Additional exploration still required:
  - none
