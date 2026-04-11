---
doc_type: research
id: 260402_1505_skills-sync-git-publish_research_01
theme: skills-sync-git-publish
status: final
roadmap_feature: F-10
parent_spec: 260323_1704_universal-skills-runtime-integration_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260402_1505_skills-sync-git-publish_plan_01
created_at: '2026-04-02T15:05:32-03:00'
updated_at: '2026-04-02T15:21:55-03:00'
---

# Research: skills-sync-git-publish

## Questions
- What is the smallest compatible way to let seeded repos consume git updates?
- What is the safest way to publish a locally edited skill back to the universal-skills git source?

## Findings
- `sync` already was the one-step installer; redefining `pull` as an installer would create avoidable semantic breakage.
- A git mirror in `.agents/cache/universal-skills` lets seeded repos refresh from git without replacing `.agents/source/universal-skills`.
- Publication should be explicit and scoped to selected skills, not the whole tree.

## Sources
- `.agents/scripts/agents-skills-sync.py` | credibility: high | source of truth for CLI behavior
- `.agents/scripts/tests/test_agents_skills_sync.py` | credibility: high | verification surface for the new contract
- `README.md` and `AGENTS.md` | credibility: high | canonical operator-facing contract
- Subagent architecture/doc passes | credibility: medium/high | bounded external review of CLI semantics and doc surface

## Decision Impact
- The change stayed additive and compatible: keep `pull`, strengthen `sync`, add `update`, add `push`.

## Open Unknowns
- None blocking this slice.
