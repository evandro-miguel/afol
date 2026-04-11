---
doc_type: explorer-check
id: 260323_1743_current-state-map-goal-state-governance_explorer-check_01
theme: current-state-map-goal-state-governance
status: final
owners:
- explorer
created_at: '2026-03-23T17:43:56-03:00'
updated_at: '2026-03-23T17:47:51-03:00'
roadmap_feature: F-11
parent_spec: 260323_1741_current-state-maps-and-goal-state-governance_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  brainstorm: 260323_1743_current-state-map-goal-state-governance_brainstorm_01
  plan: 260323_1743_current-state-map-goal-state-governance_plan_01
---

# Explorer Check: current-state-map-goal-state-governance

## Goal
- Prove the plan was checked against the current project instead of being written from assumptions.

## Scope Reviewed
- Paths inspected:
  - `.agents/arc/GENERAL-ROADMAP.md`
  - `.agents/arc/README.md`
  - `.agents/a-docs/specs/README.md`
  - `.agents/a-docs/standards/workflow.md`
  - `.agents/a-docs/standards/structure-map.md`
  - `.agents/arc/SPECS/260306_project-context-canon-and-setup_spec_01.md`
  - `.agents/arc/SPECS/260306_artifact-resolution-layer_spec_01.md`
- Existing docs inspected:
  - `README.md`
  - `AGENTS.md`
  - `.agents/rules/RULE-002-workstream-creation.md`
  - `.agents/scripts/README.md`
- Existing scripts/tools checked:
  - `./.agents/agents knowledge ...`
  - `./.agents/agents new ...`
  - `./.agents/agents index`

## Commands Used
```bash
find .agents/arc -maxdepth 3 -type f | sort
find .agents/wb -maxdepth 3 -type f | sort
rg -n "arc/map|current state|desired state|goal|roadmap" .agents -g '*.md'
./.agents/agents knowledge search "current state desired state roadmap specs architecture map"
./.agents/agents knowledge pull "bootstrap generic project state roadmap spec backlog"
./.agents/agents knowledge pull "context canon roadmap specs workbench"
sed -n '1,260p' .agents/a-docs/standards/workflow.md
sed -n '1,260p' .agents/a-docs/standards/structure-map.md
sed -n '1,260p' .agents/arc/SPECS/260306_project-context-canon-and-setup_spec_01.md
sed -n '1,260p' .agents/arc/SPECS/260306_artifact-resolution-layer_spec_01.md
```

## Findings
- The scaffold already has a strong and explicit governance model: roadmap -> parent spec -> workstream, with verification and closure rules built around that flow.
- Existing docs explicitly warn against creating a second governance tree, which means the requested split must refine the existing model rather than replace it.
- `structure-map` already documents current physical project state, but there is no canonical contract yet for a richer `.agents/arc/map/` surface.
- Knowledge lookup returned no reusable compact digest for this topic, so the plan needs to be grounded in direct repo inspection and current standards.
- The requested split is compatible with the current production style if `arc/map/` remains descriptive and goal-state docs stay outside that folder.

## Contradictions or Drift Found
- No hard contradiction was found.
- The gap is semantic: current docs describe roadmap/spec/workbench governance and current structure maps, but they do not yet define `arc/map/` as the explicit current-state surface distinct from the goal-state canon.

## Impact on the Plan
- What changed in the plan because of exploration:
  - The plan should introduce a document taxonomy, not a new planning system.
  - The parent feature should live in roadmap/spec governance as a new planned feature, not inside a standalone proposal doc.
  - The future `arc/map/` contract should be treated as input evidence for planning and review, never as the execution authority.
- What remains uncertain:
  - Which `arc/map/` artifacts should be mandatory, optional, or generated on demand.
  - How much of the future map contract belongs in bootstrap versus downstream project guidance.

## Readiness
- Plan grounded in current repo state: yes
- Additional exploration still required:
  - none before drafting the planning package

---
*Template: `.agents/a-docs/templates/explorer-check.md`*
