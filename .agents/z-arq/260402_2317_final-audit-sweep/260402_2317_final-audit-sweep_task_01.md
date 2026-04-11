---
doc_type: task
id: "260402_2317_final-audit-sweep_task_01"
theme: "final-audit-sweep"
status: active
owners: ["worker", "tester"]
created_at: "2026-04-02T23:17:20-03:00"
updated_at: "2026-04-02T23:17:20-03:00"
roadmap_feature: "F-05"
parent_spec: "260306_roadmap-first-delivery-system_spec_01"
child_spec: ""
depends_on: ["260402_2317_final-audit-sweep_plan_01"]
links:
  plan: "260402_2317_final-audit-sweep_plan_01"
  roadmap: "docs/arc/GENERAL-ROADMAP.md"
---

# Tasks: final-audit-sweep

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | pending | worker | <note> |

**State values:** `pending` | `in_progress` | `ready_for_test` | `testing` | `done` | `blocked`

**Task ID format:** `T-01`, `T-02`, ... (ou `T-001` para boards grandes)

**State marker rules:** See [../standards/checkbox-protocol.md](../standards/checkbox-protocol.md)

## Governance Context
- Roadmap feature: `F-05`
- Parent spec: `260306_roadmap-first-delivery-system_spec_01`
- Child spec: ``
- Task rule:
  - Tasks execute approved intent; they do not replace roadmap/spec definition.

## Relevant Lessons

Before starting work, consult relevant resources:

### Prevention Rules
- [ ] Check [../lessons/general-lessons.md](../lessons/general-lessons.md)
- [ ] Check lesson entries in [../lessons/entries/](../lessons/entries/)

### Useful Resources
- Rules useful for this task:
  - [ ] <rule-1>
- Docs useful for this task:
  - [ ] <doc-1>
- Skills useful for this task:
  - [ ] <skill-1>
- Integrations useful for this task:
  - [ ] <integration-1>

## Implementation Checkpoint
- Files touched:
  - <path>
- Key decisions:
  - <decision>

## Test Gate
- Move to `ready_for_test` only after implementation checkpoint.
- Record command, result, and evidence before marking done.

### Test Evidence
- Command: `<command>`
- Result: <pass/fail>
- Evidence: <paste output snippet or link>

---
*Template: `docs/templates/task.md`*
