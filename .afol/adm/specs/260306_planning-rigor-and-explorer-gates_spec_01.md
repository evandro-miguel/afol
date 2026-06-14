---
doc_type: spec
id: 260306_planning-rigor-and-explorer-gates_spec_01
theme: planning-rigor-and-explorer-gates
status: superseded
superseded_by: 260521_0000_total-reformulation-strategy_spec_01
superseded_note: "Superseded by the total reformulation strategy (260521_0000); its concerns were redesigned into the F-01..F-18 feature set."
owners:
- orchestrator
created_at: '2026-03-06T23:05:00+00:00'
updated_at: '2026-06-14T00:00:00+00:00'
roadmap_feature: F-07
spec_role: child
parent_spec: 260306_execution-intelligence-and-knowledge-system_spec_01
links:
  roadmap: 260223_0000_arc_roadmap_01
scope:
  repo_areas:
  - docs/templates
  - .agents/scripts/agents-new.py
  - .agents/scripts/verify-tasks.py
  packages:
  - planning rigor
risk_level: medium
---

# SPEC: Planning Rigor and Explorer Gates

## Intent

- Keep `plan` + `task` as the mandatory core while allowing brainstorm and explorer-check artifacts only when they add real value.

## Expected Behavior

- Major plans may link to brainstorm and explorer-check artifacts when they exist.
- Plan completion does not require force-creating brainstorm or explorer-check artifacts.
- Verification must flag unfinished optional exploration artifacts only when they are present.
- Closure must fail if any present optional exploration artifact is still open.

## User Journey

1. Create a governed session with the `plan` / `task` core.
2. Add brainstorm and explorer-check only when the work actually benefits from them.
3. Complete the plan with links to any optional exploration artifacts that were created.
4. Verify the session; present optional artifacts must be final before closure.

## Acceptance

- [x] Brainstorm template captures options, assumptions, and preferred direction when created.
- [x] Explorer-check template captures inspected paths, commands, findings, and plan-readiness when created.
- [x] New workstreams create `plan` / `task` by default without forcing optional exploration artifacts.
- [x] Strict verification catches unfinished optional exploration artifacts when they exist.

---

*Child Spec: `docs/arc/SPECS/260306_planning-rigor-and-explorer-gates_spec_01.md`*
