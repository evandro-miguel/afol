---
doc_type: lesson_entry
id: lesson_20260224_1430_wb-update-task-telemetry
status: active
created_at: '2026-02-24T14:30:00-03:00'
updated_at: '2026-06-18T13:15:00-04:00'
source: execution_review
related_session: 260224_1030_scripts-lean-efficiency
---

# Lesson: Governed Task Telemetry Is Not Optional

## Correction

All task state changes were done via direct `edit` tool on markdown files, bypassing the governed task command. In the retired runtime this was `.agents/agents wb-update task`; in current AFOL it is `afol start`, `afol evidence`, `afol done`, and `afol close`. Direct edits mean:

- ❌ No telemetry recorded for task completions
- ❌ No audit trail in session log
- ❌ No automatic timeline updates

## What Governed Task Commands Provide

- **Updates task state**: Direct Edit (Yes) vs AFOL command (Yes)
- **Records telemetry/event evidence**: Direct Edit (No) vs AFOL command (Yes)
- **Updates State Board**: Direct Edit (Yes) vs AFOL command (Yes)
- **Adds timeline entry**: Direct Edit (No) vs `afol log` (Optional)
- **Validates task ID format**: Direct Edit (No) vs AFOL command (Yes)
- **Prevents invalid states**: Direct Edit (No) vs AFOL command (Yes)

## Prevention Rule

**AFOL task commands = Fonte oficial de mudança de estado**
**edit tool = Apenas para conteúdo que AFOL não cobre**

### When to Use Each

- Mark task done / in_progress / pending: `afol start`, `afol done`
- Update task description: `edit`
- Add notes to State Board: `edit`
- Change acceptance criteria: `edit`
- Record completion with telemetry/evidence: `afol evidence`, then `afol done`

## Guardrail

### Mandatory AFOL Commands

```bash
# Mark task as done (with telemetry and evidence)
afol evidence --session <session> --task-id T-03 --command "make test-scripts" --result passed --artifact .afol/wb/<session>/<session>_report_01.md
afol done --session <session> --task-id T-03

# Mark task as in_progress (with telemetry)
afol start --session <session> --task-id T-04

# Mark task as problem
# Record the failed evidence and explain the blocker in the task/report; do not
# mark the task done until success evidence exists.
afol evidence --session <session> --task-id T-05 --command "make test-scripts" --result failed

# Add timeline entry for significant milestone
afol log --session <session> --message "Phase 3: All hotspots refactored"
```

### Telemetry Event Flow

```text
User records evidence, then runs: afol done --session <session> --task-id T-03
    ↓
Script updates: task_03.md checkbox - [ ] → - [x] and keeps the evidence id attached
    ↓
Script updates: State Board table State column
    ↓
Script records: tool_exec event in telemetry
    ↓
Event available for: heat scoring, reports, audits
```

**Without governed AFOL task commands:** No telemetry event -> invisible in reports

## Related Commands

```bash
# View task status
afol verify-tasks --strict .afol/wb/<session>

# View command metadata
afol help start
afol help done

# View telemetry for task completions
afol telemetry query --event-type=task_completed
```

## Related Lessons

- `lesson_20260224_1420_task-execution-integrity` - Mark done only after real work
- `lesson_20260224_1425_task-list-vs-state-board` - Task List vs State Board purposes
