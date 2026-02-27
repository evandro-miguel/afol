---
doc_type: task
id: "YYMMDD_HHMM_<theme>_task_01"
theme: "<theme>"
status: active
owners: ["worker", "tester"]
created_at: "YYYY-MM-DDTHH:MM:SSZ"
updated_at: "YYYY-MM-DDTHH:MM:SSZ"
depends_on: ["<optional_plan_id>"]
---

# Tasks: <theme>

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | pending | worker | <note> |

**State values:** `pending` | `in_progress` | `ready_for_test` | `testing` | `done` | `blocked`

**Task ID format:** `T-01`, `T-02`, ... (ou `T-001` para boards grandes)

**State marker rules:** See [../standards/checkbox-protocol.md](../standards/checkbox-protocol.md)

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
*Template: `.agents/a-docs/templates/task.md`*
