---
doc_type: research
id: 260402_1613_scaffold-ops-skill_research_01
theme: scaffold-ops-skill
status: final
roadmap_feature: F-10
parent_spec: 260323_1704_universal-skills-runtime-integration_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260402_1613_scaffold-ops-skill_plan_01
created_at: '2026-04-02T16:13:52-03:00'
updated_at: '2026-04-02T16:49:35-03:00'
---

# Research: scaffold-ops-skill

## Questions
- Which runtime surfaces still prevent the scaffold from feeling easy and
  self-contained for agents?
- Where does the local source contract diverge from the git-backed skill
  catalog contract?

## Findings
- The indexed project search highlighted `source_repo_path`, `cmd_list`,
  `cmd_search`, `validate_target`, and the local seed helpers as the remaining
  debt surfaces.
- The current repo-local source was inconsistent until reseeded: `core.json`
  referenced more skills than were present under `.agents/source/universal-skills/skills/`.
- The default manifest contract was incomplete: `default_profile` suppressed the
  intended explicit default skill pinning.

## Sources
- `.agents/scripts/agents-skills-sync.py` | credibility: high | authoritative runtime behavior
- `.agents/scripts/agents-bootstrap.py` | credibility: high | authoritative bootstrap behavior
- `rag-docs` project `agentic-start-folder-agents` (`md79tkzg41xw37q83es5vak5td842k2w`) | credibility: high | indexed lookup for remaining debt surfaces
- `.agents/skills-sync.manifest.json` | credibility: high | current repo contract for default installs

## Decision Impact
- The work needed to include runtime behavior fixes, local source reseeding, and
  a manifest contract correction, not only docs.

## Open Unknowns
- No blocker remained after the RAG-backed inspection; only future UX polish is left.

---
*Template: `.agents/a-docs/templates/research.md`*
