---
doc_type: research
id: 260402_1858_project-docs-root-migration_research_01
theme: project-docs-root-migration
status: final
roadmap_feature: F-11
parent_spec: 260323_1741_current-state-maps-and-goal-state-governance_spec_01
child_spec: ''
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  plan: 260402_1858_project-docs-root-migration_plan_01
created_at: '2026-04-02T18:58:13-03:00'
updated_at: '2026-04-02T20:36:36-03:00'
---

# Research: project-docs-root-migration

## Questions
- Which files still hardcode `.agents/a-docs`, `.agents/arc`, or `.agents/templates` after the folder move?
- What must bootstrap copy vs generate so downstream repos stay self-contained without inheriting local workbench state?

## Findings
- Config and runtime scripts depended on the old paths and had to be retargeted before validation would pass.
- Bootstrap needed a stricter split: copy reusable docs/skills/runtime surfaces, generate baseline `docs/arc`/`docs/map`, and never export local `.agents/wb/` history.
- Generated surfaces (`docs/arc/structure`, `docs/map`, indexes, runtime mirrors) needed a full refresh after the path migration.

## Sources
- `rg` inventory over the repo | credibility: high | exact source of remaining path consumers
- `.agents/scripts/agents-bootstrap.py` | credibility: high | defines downstream contract
- `.agents/scripts/tests/test_runtime_compatibility.py` | credibility: high | proves bootstrap/runtime behavior
- `.agents/scripts/tests/integration/test_critical_workflows.py` | credibility: high | proves isolated repo workflows

## Decision Impact
- The migration had to be treated as a contract change, not as a docs-only move.

## Open Unknowns
- none

---
*Template: `docs/templates/research.md`*
