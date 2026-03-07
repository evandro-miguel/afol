---
doc_type: spec
id: 260306_planning-rigor-and-explorer-gates_spec_01
theme: planning-rigor-and-explorer-gates
status: active
owners:
  - orchestrator
created_at: '2026-03-06T23:05:00+00:00'
updated_at: '2026-03-06T23:05:00+00:00'
roadmap_feature: F-07
spec_role: child
parent_spec: 260306_execution-intelligence-and-knowledge-system_spec_01
links:
  roadmap: 260223_0000_arc_roadmap_01
scope:
  repo_areas:
    - .agents/a-docs/templates
    - .agents/scripts/agents-new.py
    - .agents/scripts/verify-tasks.py
  packages:
    - planning rigor
risk_level: medium
---

# SPEC: Planning Rigor and Explorer Gates

## Intent
- Require structured brainstorming and explicit repo exploration before a major plan can be treated as complete.

## Expected Behavior
- Major plans must link to a brainstorm artifact.
- Major plans must link to an explorer-check artifact documenting current-project review.
- Verification must flag missing mandatory exploration artifacts for governed work.

## User Journey
1. Create a governed session.
2. Fill brainstorm and explorer-check.
3. Complete the plan with links to those artifacts.
4. Verify the session; missing gates are flagged.

## Acceptance
- [ ] Brainstorm template captures options, assumptions, and preferred direction.
- [ ] Explorer-check template captures inspected paths, commands, findings, and plan-readiness.
- [ ] New workstreams create both artifacts by default.
- [ ] Strict verification catches missing exploration gates.

---
*Child Spec: `.agents/arc/SPECS/260306_planning-rigor-and-explorer-gates_spec_01.md`*
