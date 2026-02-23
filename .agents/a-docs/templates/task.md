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

## Task List
- [ ] T-01 <task description>
- [ ] T-02 <task description>

## State Board
| Task | Checklist | State | Owner | Notes |
|------|----------:|-------|-------|-------|
| T-01 | - [ ] | pending | build | <note> |

State values:
- pending
- in_progress
- ready_for_test
- testing
- done
- blocked

Task ID format:
- `T-01`, `T-02`, ... (or `T-001`, `T-002` for larger boards)

## State Marker Rules

See: [`.agents/a-docs/standards/checkbox-protocol.md`](.agents/a-docs/standards/checkbox-protocol.md)

## Lessons Aplicáveis

Before starting work, consult relevant resources:

### Prevention Rules
- [ ] Check relevant lesson entries in [`.agents/a-docs/lessons/entries/`](.agents/a-docs/lessons/entries/)

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
