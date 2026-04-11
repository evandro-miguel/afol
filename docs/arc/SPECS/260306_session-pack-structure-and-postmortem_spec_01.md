---
doc_type: spec
id: 260306_session-pack-structure-and-postmortem_spec_01
theme: session-pack-structure-and-postmortem
status: active
owners:
- orchestrator
created_at: '2026-03-06T23:05:00+00:00'
updated_at: '2026-04-04T10:08:10-03:00'
roadmap_feature: F-07
spec_role: child
parent_spec: 260306_execution-intelligence-and-knowledge-system_spec_01
links:
  roadmap: 260223_0000_arc_roadmap_01
scope:
  repo_areas:
  - .agents/wb
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

- Support multiple major plan tracks inside one session while making final session closure require a post-mortem.

## Expected Behavior

- Sessions may contain pack folders for separate major plan tracks.
- Tooling works recursively across session roots and pack folders.
- Final report closure is blocked until a post-mortem exists.

## User Journey

1. A session is created.
2. If the session splits into multiple major efforts, each effort gets its own pack folder.
3. Execution proceeds with recursive tooling support.
4. Before marking the report final, a post-mortem is completed.

## Acceptance

- [ ] `agents-new` supports optional pack creation.
- [ ] Workbench tools operate recursively inside sessions.
- [ ] A post-mortem template exists and can be materialized when real closure analysis starts.
- [ ] `wb-update status --file report --value final` fails without a post-mortem.

---

*Child Spec: `docs/arc/SPECS/260306_session-pack-structure-and-postmortem_spec_01.md`*
