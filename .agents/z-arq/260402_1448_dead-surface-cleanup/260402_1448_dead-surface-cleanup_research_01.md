---
doc_type: research
id: 260402_1448_dead-surface-cleanup_research_01
theme: dead-surface-cleanup
status: final
roadmap_feature: F-11
parent_spec: 260323_1741_current-state-maps-and-goal-state-governance_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260402_1448_dead-surface-cleanup_plan_01
created_at: '2026-04-02T14:48:32-03:00'
updated_at: '2026-04-02T15:01:22-03:00'
---

# Research: dead-surface-cleanup

## Questions
- Which suspected legacy surfaces are safe to remove with local proof only?
- Which candidates should remain because they still carry compatibility risk?

## Findings
- High-confidence dead surfaces were local scaffold leftovers: one migration
  script, one placeholder E2E package file, one unused test-data YAML, a tracked
  `.coverage` file, and one unused bootstrap helper.
- Compatibility-cache candidates under `.agents/cache/universal-skills` had
  weaker proof and were intentionally left out of this cleanup.
- Generated structure docs needed regeneration after deletion to stay truthful.

## Sources
- `.agents/scripts/agents-bootstrap.py` | credibility: high | local source of bootstrap helper truth
- `.agents/scripts/tests/` | credibility: high | current committed suite and placeholder leftovers
- `.agents/arc/structure/` | credibility: high | generated inventory that needed refresh
- Subagent findings from `refactor-strategist` and `explore` | credibility: medium/high | useful secondary confirmation for candidate selection

## Decision Impact
- The cleanup stayed local, conservative, and proof-based.

## Open Unknowns
- Whether any compatibility-cache subtree can be retired without affecting older downstream repos.

---
*Template: `.agents/a-docs/templates/research.md`*
