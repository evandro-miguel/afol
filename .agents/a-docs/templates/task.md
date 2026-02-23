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
- `- [ ]` pending
- `- [/]` in progress
- `- [%]` implemented, not tested yet (ready_for_test)
- `- [!]` blocked/error (requires blocks file)
- `- [>]` skipped by user request (requires log entry)
- `- [x]` completed (tested and verified)

### Marker Authorization Rules
| Marker | Who can set | Requires log |
|--------|-------------|--------------|
| `- [ ]` | Anyone | No |
| `- [/]` | Agent | No |
| `- [%]` | Agent | No |
| `- [!]` | Agent | Yes (blocks file) |
| `- [>]` | **User only** | **Yes (mandatory)** |
| `- [x]` | Agent | No |

**IMPORTANT:** Agents MUST NOT set `- [>]` without explicit user authorization.

### Blocked Tasks Protocol
When marking a task with `- [!]`:
1. Create `<task-id>-blocks.md` in the same session folder
2. Document the problem, error messages, and context
3. Propose next steps or workarounds
4. Link the blocks file in the Notes column

### Skipped Tasks Protocol
When a task is marked with `- [>]`:
1. User must explicitly authorize the skip
2. Agent must create a log entry in the session log file with:
   - Which task was skipped
   - User's reason for skipping
   - Timestamp of authorization
3. Mark the task as skipped in the State Board

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
