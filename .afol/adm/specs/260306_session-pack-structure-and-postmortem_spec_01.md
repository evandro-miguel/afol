---
doc_type: spec
id: 260306_session-pack-structure-and-postmortem_spec_01
theme: session-pack-structure-and-postmortem
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
  - .afol/wb
  - .agents/scripts/agents-new.py
  - .agents/scripts/agents-wb-update.py
  - .agents/scripts/verify-tasks.py
  packages:
  - session structure
  - closure discipline
risk_level: medium
---

# SPEC: Session Pack Structure and Postmortem

## Intent

- Support multiple major plan tracks inside one session while keeping postmortem optional and requiring any present optional artifact to be final before closure.

## Expected Behavior

- Sessions may contain pack folders for separate major plan tracks.
- Tooling works recursively across session roots and pack folders.
- Brainstorm, research, explorer-check, and postmortem artifacts are optional.
- Final session closure is blocked if any present optional artifact is not final.
- A postmortem, when present, records which optional artifacts existed and whether they were final.

## User Journey

1. A session is created.
2. If the session splits into multiple major efforts, each effort gets its own pack folder.
3. Execution proceeds with recursive tooling support.
4. Optional brainstorm, research, explorer-check, and postmortem artifacts are created only when they add real value.
5. Before closing the session, any present optional artifact is final, and the postmortem, when present, records the state of those optional artifacts.

## Acceptance

- [x] `agents-new` supports optional pack creation.
- [x] Workbench tools operate recursively inside sessions.
- [x] A post-mortem template exists for sessions that need closure analysis.
- [x] Finalization checks only block closure when a present optional artifact is not final.

---

*Child Spec: `.afol/adm/specs/260306_session-pack-structure-and-postmortem_spec_01.md`*
