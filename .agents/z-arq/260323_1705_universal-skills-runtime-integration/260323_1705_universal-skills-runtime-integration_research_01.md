---
doc_type: research
id: 260323_1705_universal-skills-runtime-integration_research_01
theme: universal-skills-runtime-integration
status: final
roadmap_feature: F-10
parent_spec: 260323_1704_universal-skills-runtime-integration_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260323_1705_universal-skills-runtime-integration_plan_01
created_at: '2026-03-23T17:05:28-03:00'
updated_at: '2026-03-23T17:25:44-03:00'
---

# Research: universal-skills-runtime-integration

## Questions
- What parts of upstream universal-skills materially improve this scaffold for interactive runtime use?
- What should remain scaffold-owned instead of being delegated wholesale to upstream scripts?

## Findings
- Upstream universal-skills already solves pinned source refs, profiles, runtime apps, on-demand skill install, and doctor/contract checks.
- This scaffold should still own bootstrap, roadmap/workbench governance, runtime mirrors, and repo-local operator UX.
- The best integration shape is a scaffold-native command surface backed by stronger upstream-compatible manifest semantics.

## Sources
- `.agents/cache/universal-skills/README.md` | credibility: high | notes: defines upstream install, lockfile, app target, doctor, and bootstrap contract
- `.agents/scripts/agents-skills-sync.py` | credibility: high | notes: current local implementation and capability limits
- `.agents/skills-sync.manifest.json` | credibility: high | notes: current local state model
- `AGENTS.md` | credibility: high | notes: confirms interactive CLI runtime positioning for this scaffold

## Decision Impact
- Plan should preserve scaffold-local commands and docs while upgrading the underlying skills contract to support repo/ref/profile semantics and better runtime targeting.

## Open Unknowns
- No blocker for opening execution; migration details will be resolved during implementation.

---
*Template: `.agents/a-docs/templates/research.md`*
