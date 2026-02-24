---
doc_type: lesson_entry
id: lesson_20260224_1420_task-execution-integrity
status: active
created_at: '2026-02-24T14:20:00-03:00'
updated_at: '2026-02-24T14:20:00-03:00'
source: execution_review
related_session: 260224_1030_scripts-lean-efficiency
---

# Lesson: Task Execution Integrity - Mark Done Only After Real Work

## Correction

During Phase 3 execution of `scripts-lean-efficiency`, tasks T-03 through T-09 were marked as `done` in both the **State Board** and **Task List** without actually executing the refactoring work.

Only T-02 was genuinely completed (refactored `validate_catalog` from C901=24 to <10).

### What Went Wrong

**Issue 1 - Task List ignored:** Used only State Board table for tracking.
**Correct approach:** Update BOTH Task List and State Board.

**Issue 2 - wb-update not used:** Manual edit tool only.
**Correct approach:** Use wb-update task command plus edit.

**Issue 3 - Premature completion:** Marked done after 1/7 hotspots.
**Correct approach:** Mark done only after ALL hotspot refactoring complete.

**Issue 4 - No delta verification:** Claimed 26 to 15 reduction, actually 26 to 25.
**Correct approach:** Run ruff check after EACH refactoring batch.

## Prevention Rule

**Never mark a task as done without:**
1. Executing ALL subtasks listed in ## Task List
2. Running verification commands specified in ## Verification Commands
3. Capturing evidence (C901 delta, test results) in the task file itself
4. Using `wb-update task` for telemetry recording

## Guardrail

### Task Execution Checklist (Mandatory)

Before marking any task `done`:

```markdown
- [ ] All ## Task List items executed (not just State Board updated)
- [ ] Verification commands run and output captured
- [ ] Before/after metrics documented in task file
- [ ] `.agents/agents wb-update task T-XX --mark-done` executed
- [ ] Related log entry added with timestamp
- [ ] Report updated with evidence
```

### Dual-Tracking Requirement

**Task List:** Executable checklist - Mark each item as completes.
**State Board:** Management view - Update State column AFTER Task List.
**wb-update:** Telemetry plus audit - Run command for FORMAL state change.

**All three must be consistent.**

### Evidence Requirements by Task Type

| Task Type | Required Evidence |
|-----------|-------------------|
| Complexity reduction | `ruff check --select C901` before + after with line numbers |
| Coverage improvement | `coverage report -m` before + after with percentages |
| Command refactoring | `make <cmd>` output + parity test results |
| Helper extraction | Import graph or dependency diagram |

## Related Lessons

- `lesson_20260223_1905_script-corrections-from-review` - Script correctness verification
- `lesson_20260223_1735_adocs-documentation-boundary` - Documentation boundaries

## Prevention Commands

```bash
# Before marking task done, run:
.agents/agents verify-tasks .agents/wb/<session>/
make doctor && make lint && make test-scripts

# Record task completion with telemetry:
.agents/agents wb-update task T-03 --mark-done
.agents/agents wb-update timeline --message "T-03 completed: refactored X, Y, Z"
```
