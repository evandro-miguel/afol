---
doc_type: lesson_entry
id: lesson_20260224_1425_task-list-vs-state-board
status: active
created_at: '2026-02-24T14:25:00-03:00'
updated_at: '2026-02-24T14:25:00-03:00'
source: execution_review
related_session: 260224_1030_scripts-lean-efficiency
---

# Lesson: Task List vs State Board - Different Purposes, Both Required

## Correction

During execution, the **State Board** (table) was used exclusively while the **Task List** (checklist) was ignored. This caused loss of actionable detail.

## What Each Is For

| Component | Format | Purpose | Level of Detail |
|-----------|--------|---------|-----------------|
| **Task List** | `- [ ] T-01 Description` | Executable checklist | **Specific** - exact work items |
| **State Board** | `\| T-01 \| - [ ] \| pending \|` | Management dashboard | **Summary** - status at a glance |

### Example from task_03.md

**Task List (what to execute):**
`- [ ]` task item:

- [ ] T-03 Refactor `agents-telemetry.py` hotspots (`calculate_heat_scores`, `generate_report`, `main`).

**State Board (status tracking):**
State row fields:

- Task: `T-03`
- Checklist: `- [ ]` (for execution record)
- State: `pending`
- Owner: `worker`
- Notes: `Highest ROI area #2.`

### Why Task List Matters

The **Task List** contains:

- ✅ **Specific function names** (`calculate_heat_scores`, `generate_report`, `main`)
- ✅ **Target script** (`agents-telemetry.py`)
- ✅ **Action verb** (`Refactor`)

The **State Board** Notes column only said:

- ⚠️ "Highest ROI area #2" - **vago, não executável**

## Prevention Rule

**Task List = Fonte da verdade para execução**
**State Board = Visão gerencial para acompanhamento**

**Sempre atualizar AMBOS:**

1. Execute task item from Task List
2. Mark `- [ ]` → `- [x]` in Task List
3. Update State column in State Board: `pending` → `in_progress` → `done`
4. Run `wb-update task` for telemetry

## Guardrail

### Task Execution Flow (Mandatory Order)

```text
1. Read ## Task List for specific work items
2. Execute the work
3. Record closure evidence: `.agents/agents wb-update evidence T-XX --command "..." --result passed --artifact <path>`
4. Update Task List: - [ ] → - [x] with the returned evidence id
5. Update State Board: pending → in_progress → done
6. Run: `.agents/agents wb-update task T-XX --mark-done --evidence-id E-...`
7. Add timeline entry: `.agents/agents wb-update timeline --message "..."`
```

### Template Compliance

Both sections must exist and be consistent:

**Task List example**

- [x] T-01 Specific actionable item with details.

**State Board example**
Task row:

- Task: `T-01`
- Checklist: `- [x]`
- State: `done`
- Owner: `worker`
- Notes: `Details completed`

**Inconsistency = Error** (Task List says `- [ ]` but State Board says `done`)

## Related Patterns

- **PAT-002**: Single Active Session - task tracking consistency
- **Task ID Standardization**: Use `T-01`, `T-02` format consistently
