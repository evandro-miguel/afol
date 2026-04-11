---
doc_type: research
id: 260307_1734_persistent-planning-memory_research_01
theme: persistent-planning-memory
status: active
roadmap_feature: F-09
parent_spec: 260307_persistent-planning-memory_spec_01
child_spec: ''
links:
  roadmap: 260223_0000_arc_roadmap_01
  plan: 260307_1734_persistent-planning-memory_plan_01
created_at: '2026-03-07T17:34:00-03:00'
updated_at: '2026-03-07T18:19:40-03:00'
---

# Research: persistent-planning-memory

## Questions
- Which parts of the "planning with files" pattern are already covered by the current scaffold?
- Which parts represent real product gaps instead of alternate naming?
- How should the external security guidance translate into native scaffold rules?

## Findings
- The external pattern’s three persistent files map naturally onto existing workbench artifacts:
  - `task_plan.md` -> `plan`
  - `findings.md` -> `research`
  - `progress.md` -> `log`
- The scaffold already solves richer governance needs that the external pattern does not cover, including roadmap linkage, parent specs, task state boards, reports, and postmortems.
- The real missing capability is not persistence itself; it is explicit catchup/resume support plus stronger cadence around note capture during exploration-heavy work.
- The external warning about prompt injection through auto-reloaded plan files is relevant here and should become a native rule: external content belongs in `research`, not `plan`.

## Sources
- User-provided "Planning with Files" guidance | credibility: high | notes: source inspiration and security boundary
- `.agents/arc/GENERAL-ROADMAP.md` | credibility: high | notes: confirms roadmap-first planning model
- `.agents/arc/SPECS/260306_execution-intelligence-and-knowledge-system_spec_01.md` | credibility: high | notes: adjacent feature set for planning rigor and knowledge reuse
- `.agents/scripts/agents-status.py` | credibility: high | notes: current session-context surface
- `.agents/scripts/agents-knowledge.py` | credibility: high | notes: current reusable knowledge surface

## Decision Impact
- The best improvement path is to add catchup/freshness ergonomics on top of the current workbench, not to introduce duplicate root planning files.

## Open Unknowns
- Whether a lightweight note-cadence signal should be implemented in `status`, `review`, `verify`, or a dedicated catchup command.
- Whether optional root compatibility files are ever worth supporting as generated mirrors.

---
*Template base: `.agents/a-docs/templates/research.md`*
