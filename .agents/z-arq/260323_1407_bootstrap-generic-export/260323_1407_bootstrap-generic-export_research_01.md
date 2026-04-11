---
doc_type: research
id: 260323_1407_bootstrap-generic-export_research_01
theme: bootstrap-generic-export
status: final
roadmap_feature: F-04
parent_spec: 260306_roadmap-first-delivery-system_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260323_1407_bootstrap-generic-export_plan_01
created_at: '2026-03-23T14:07:57-03:00'
updated_at: '2026-03-23T14:18:47-03:00'
---

# Research: bootstrap-generic-export

## Questions
- Which current bootstrap inputs are reusable system assets versus scaffold-local operational history?
- What minimum generated files are required so a fresh target repo passes governance checks immediately after bootstrap?

## Findings
- Reusable assets: runtime entrypoints, wrapper/config, scripts, rules, skills, templates, standards docs, and spec/ADR templates.
- Non-reusable history: `.agents/a-docs/knowledge/INDEX.md`, `.agents/a-docs/lessons/entries/*.md`, `.agents/a-docs/telemetry/reports/*`, and scaffold-specific files under `.agents/arc/`.
- `doctor` rejects roadmap features that point to non-existent governing spec files, so the generated roadmap must reference real starter parent specs.

## Sources
- `.agents/scripts/agents-bootstrap.py` | credibility: high | current bootstrap contract and copy behavior
- `.agents/a-docs/agentic/agents-bootstrap.md` | credibility: high | canonical tool documentation
- `.agents/agents bootstrap <tmpdir>` | credibility: high | end-to-end reproduction in a real target repo

## Decision Impact
- Implement directory-level sanitization for copied `a-docs` content.
- Generate starter `arc` governance docs, including valid parent specs referenced by the generated roadmap.

## Open Unknowns
- none

---
*Template: `.agents/a-docs/templates/research.md`*
