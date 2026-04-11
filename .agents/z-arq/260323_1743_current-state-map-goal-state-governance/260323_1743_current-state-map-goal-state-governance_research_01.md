---
doc_type: research
id: 260323_1743_current-state-map-goal-state-governance_research_01
theme: current-state-map-goal-state-governance
status: final
roadmap_feature: F-11
parent_spec: 260323_1741_current-state-maps-and-goal-state-governance_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260323_1743_current-state-map-goal-state-governance_plan_01
created_at: '2026-03-23T17:43:56-03:00'
updated_at: '2026-03-23T17:47:51-03:00'
---

# Research: current-state-map-goal-state-governance

## Questions
- How should the scaffold distinguish current-state project maps from goal-state governance docs?
- Where should desired architecture, roadmap, specs, and product direction live once `.agents/arc/map/` is introduced?

## Findings
- `./.agents/agents knowledge search "current state desired state roadmap specs architecture map"` returned no reusable knowledge matches.
- `./.agents/agents knowledge pull "bootstrap generic project state roadmap spec backlog"` returned no reusable compact digest.
- `./.agents/agents knowledge pull "context canon roadmap specs workbench"` returned no reusable compact digest.
- `.agents/arc/GENERAL-ROADMAP.md` already defines roadmap and specs as the canonical product philosophy layer, with workstreams as the execution layer.
- `.agents/a-docs/standards/workflow.md` already requires roadmap and parent spec before non-trivial execution, so the new feature must not weaken this sequence.
- `.agents/a-docs/standards/structure-map.md` covers current physical structure documentation but does not define a richer `arc/map/` contract or a state-vs-goal taxonomy.
- `.agents/arc/SPECS/260306_project-context-canon-and-setup_spec_01.md` explicitly warns against duplicating the governance tree, which rules out making `arc/map/` a second planning surface.

## Sources
- `.agents/arc/GENERAL-ROADMAP.md` | credibility: high | defines the current governance model and product-philosophy boundaries
- `.agents/a-docs/standards/workflow.md` | credibility: high | defines the required work sequence for non-trivial work
- `.agents/a-docs/standards/structure-map.md` | credibility: high | defines how current-state structural docs are treated today
- `.agents/arc/SPECS/260306_project-context-canon-and-setup_spec_01.md` | credibility: high | defines canonical context and warns against duplicate governance trees
- `.agents/arc/SPECS/260306_artifact-resolution-layer_spec_01.md` | credibility: high | defines how logical artifact resolution should stay tied to canonical `.agents` locations

## Decision Impact
- The planning package should add an explicit current-state vs goal-state taxonomy without redefining roadmap/spec/workbench authority.
- The future `arc/map/` surface should be descriptive and refreshable, while architecture direction, roadmap, and specs remain normative outside that folder.

## Open Unknowns
- Which `arc/map/` artifacts should be required for downstream repos versus optional/generated on demand.
- Whether bootstrap should create an empty `arc/map/` baseline or only document the contract until map tooling is adopted.

---
*Template: `.agents/a-docs/templates/research.md`*
