---
doc_type: research
id: 260323_1827_universal-skills-local-source-and-discovery_research_01
theme: universal-skills-local-source-and-discovery
status: final
roadmap_feature: F-10
parent_spec: 260323_1704_universal-skills-runtime-integration_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260323_1827_universal-skills-local-source-and-discovery_plan_01
created_at: '2026-03-23T18:27:53-03:00'
updated_at: '2026-03-23T19:07:53-03:00'
---

# Research: universal-skills-local-source-and-discovery

## Questions
- What is the minimum contract needed so agents can discover and ensure skills from the project itself?
- How should the scaffold prefer a sibling checkout without breaking repos that still have `.agents/cache/universal-skills`?
- How can global Codex skills be cleaned up safely now that the source repo is available locally?

## Findings
- The upstream checkout at `/home/ozy/apps/universal-skills` contains the same structure expected by the scaffold: `skills/`, `profiles/`, `adapters/`, and `index.json`.
- The current `agents-skills-sync.py` already has the internal primitives needed for discovery, including `available_skills()`, runtime normalization, profile resolution, and apply/check flows.
- The missing piece is command-surface and source selection, not a full rewrite of the installer logic.
- The global Codex skills directory contains many folders that match the upstream `universal-skills/skills/*` names, so it can be cleaned by moving only overlapping entries and leaving non-overlapping custom skills in place.

## Sources
- `.agents/scripts/agents-skills-sync.py` | credibility: high | notes: current implementation and command surface
- `.agents/scripts/tests/test_agents_skills_sync.py` | credibility: high | notes: current behavior contract
- `.agents/arc/SPECS/260323_1704_universal-skills-runtime-integration_spec_01.md` | credibility: high | notes: governing feature intent for `F-10`
- `/home/ozy/apps/universal-skills/index.json` | credibility: high | notes: confirms local source checkout structure
- `/home/ozy/.codex/skills` | credibility: high | notes: confirms overlapping global skill payload that should be removed

## Decision Impact
- Keep the existing manifest semantics and apply/check pipeline, but add a preferred local source checkout and a discovery/on-demand command surface.
- Remove overlapping global Codex skills by archiving them out of the global folder rather than hard deleting them.

## Open Unknowns
- none

---
*Template: `.agents/a-docs/templates/research.md`*
