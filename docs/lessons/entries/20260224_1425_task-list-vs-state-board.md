---
doc_type: lesson_entry
id: lesson_20260224_1425_task-list-vs-state-board
status: superseded
created_at: '2026-02-24T14:25:00-03:00'
updated_at: '2026-06-20T00:00:00-03:00'
source: execution_review
related_session: 260224_1030_scripts-lean-efficiency
superseded_by: afol_state_board_lifecycle
---

# Superseded Lesson: Task List vs State Board

## Current Contract

This entry is retained as historical context only. It is not operational
guidance for current AFOL workbench files.

Current task lifecycle rules:

- The `State Board` table is the task state source of truth.
- Do not add parallel `Task List` checkboxes for `T-xx` lifecycle state.
- Use AFOL lifecycle commands for state transitions and closure evidence.
- Validate task state with `afol verify-tasks --strict`.

```bash
afol start --session <session-id> --task-id T-01
afol evidence --session <session-id> --task-id T-01 --command "<cmd>" --result passed
afol done --session <session-id> --task-id T-01
afol verify-tasks .afol/wb/<session-id> --strict
afol close --session <session-id>
```

## Historical Context

The original lesson was written when workbench files used both a Task List and
a State Board. That dual-tracking model is retired because it created duplicate
state and stale task closures.

If an old workbench task file still contains both `State Board` rows and
`- [ ] T-xx` checklist rows, treat it as drift and reconcile back to the
canonical `State Board` before closure.

## Related Patterns

- **PAT-002**: Single Active Session - task tracking consistency
- **Task ID Standardization**: Use `T-01`, `T-02` format consistently
