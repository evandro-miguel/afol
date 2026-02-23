---
doc_type: task
id: "260223_1827_id-fix-check_task_01"
theme: "id-fix-check"
status: active
owners: ["worker", "tester"]
created_at: "2026-02-23T18:27:26Z"
updated_at: "2026-02-23T18:27:26Z"
depends_on: ["<optional_plan_id>"]
---

# Tasks: id-fix-check

## Task List
- [ ] T-001 <task description>
- [ ] T-002 <task description>

## State Board
| Task | Checklist | State | Owner | Notes |
|------|----------:|-------|-------|-------|
| T-001 | - [ ] | pending | build | <note> |

State values:
- pending
- in_progress
- ready_for_test
- testing
- done
- blocked

## State Marker Rules

See: [`.agents/a-docs/standards/checkbox-protocol.md`](.agents/a-docs/standards/checkbox-protocol.md)

## Lessons Aplicáveis

Before starting work, consult relevant resources:

### Prevention Rules
- [ ] Check: [`.agents/a-docs/lessons/general-lessons.md`](.agents/a-docs/lessons/general-lessons.md)

### Useful Resources
- Rules useful for this task:
  - [ ] <rule-1>
- Docs useful for this task:
  - [ ] <doc-1>
- Skills useful for this task:
  - [ ] <skill-1>
- Integrações useful for this task:
  - [ ] <integracao-1>

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
*Template: `.agents/a-docs/templates/task.md`*
