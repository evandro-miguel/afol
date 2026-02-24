---
doc_type: lesson_entry
id: lesson_20260224_1430_wb-update-task-telemetry
status: active
created_at: '2026-02-24T14:30:00-03:00'
updated_at: '2026-02-24T14:30:00-03:00'
source: execution_review
related_session: 260224_1030_scripts-lean-efficiency
---

# Lesson: wb-update task for Telemetry - Not Optional

## Correction

All task state changes were done via direct `edit` tool on markdown files, bypassing `.agents/agents wb-update task`. This means:
- ❌ No telemetry recorded for task completions
- ❌ No audit trail in session log
- ❌ No automatic timeline updates

## What wb-update task Provides

- **Updates checkbox**: Direct Edit (Yes) vs wb-update task (Yes)
- **Records telemetry event**: Direct Edit (No) vs wb-update task (Yes)
- **Updates State Board**: Direct Edit (Yes) vs wb-update task (Yes)
- **Adds timeline entry**: Direct Edit (No) vs wb-update task (Optional)
- **Validates task ID format**: Direct Edit (No) vs wb-update task (Yes)
- **Prevents invalid states**: Direct Edit (No) vs wb-update task (Yes)

## Prevention Rule

**wb-update task = Fonte oficial de mudança de estado**
**edit tool = Apenas para conteúdo que wb-update não cobre**

### When to Use Each

| Use Case | Tool |
|----------|------|
| Mark task done/in_progress/pending | `wb-update task` |
| Update task description | `edit` |
| Add notes to State Board | `edit` |
| Change acceptance criteria | `edit` |
| Record completion with telemetry | `wb-update task` |

## Guardrail

### Mandatory wb-update Commands

```bash
# Mark task as done (with telemetry)
.agents/agents wb-update task T-03 --mark-done

# Mark task as in_progress (with telemetry)
.agents/agents wb-update task T-04 --mark-in-progress

# Mark task as blocked (with reason)
.agents/agents wb-update task T-05 --mark-blocked

# Add timeline entry for significant milestone
.agents/agents wb-update timeline --message "Phase 3: All hotspots refactored"
```

### Telemetry Event Flow

```
User runs: wb-update task T-03 --mark-done
    ↓
Script updates: task_03.md checkbox - [ ] → - [x]
    ↓
Script updates: State Board table State column
    ↓
Script records: tool_exec event in telemetry
    ↓
Event available for: heat scoring, reports, audits
```

**Without wb-update:** No telemetry event → invisible in reports

## Related Commands

```bash
# View task status
.agents/agents verify-tasks .agents/wb/<session>/

# Update task with all state options
.agents/agents wb-update task --help

# View telemetry for task completions
.agents/agents telemetry query --event-type=task_completed
```

## Related Lessons

- `lesson_20260224_1420_task-execution-integrity` - Mark done only after real work
- `lesson_20260224_1425_task-list-vs-state-board` - Task List vs State Board purposes
