---
doc_type: lesson_entry
id: lesson_20260224_1420_task-execution-integrity
status: active
created_at: '2026-02-24T14:20:00-03:00'
updated_at: '2026-06-20T00:00:00-03:00'
source: execution_review
related_session: 260224_1030_scripts-lean-efficiency
---

# Lesson: Task Execution Integrity - Mark Done Only After Real Work

## Correction

During Phase 3 execution of `scripts-lean-efficiency`, tasks T-03 through T-09 were marked as `done` in both the **State Board** and **Task List** without actually executing the refactoring work.

Only T-02 was genuinely completed (refactored `validate_catalog` from C901=24 to <10).

### What Went Wrong

**Issue 1 - Task detail ignored:** The state table was updated without
executing the concrete work described by the task.
**Correct approach:** Keep task detail in the task body/spec notes, but use the
State Board as the only lifecycle state source.

**Issue 2 - Lifecycle CLI not used:** Manual edit tool only.
**Correct approach:** Use AFOL lifecycle commands for task state and evidence.

**Issue 3 - Premature completion:** Marked done after 1/7 hotspots.
**Correct approach:** Mark done only after ALL hotspot refactoring complete.

**Issue 4 - No delta verification:** Claimed 26 to 15 reduction, actually 26 to 25.
**Correct approach:** Run ruff check after EACH refactoring batch.

## Prevention Rule

**Never mark a task as done without:**

1. Executing all concrete work described by the task body, spec, and notes
2. Running verification commands specified in ## Verification Commands
3. Capturing evidence (C901 delta, test results) in the task file itself
4. Recording closure evidence with `afol evidence`
5. Marking completion with `afol done`

## Guardrail

### Task Execution Checklist (Mandatory)

Before marking any task `done`:

```markdown
- All concrete task requirements executed, not only the State Board row updated
- Verification commands run and output captured
- Before/after metrics documented in task file or report
- `afol evidence --session <session-id> --task-id T-XX ...` recorded passing closure evidence
- `afol done --session <session-id> --task-id T-XX` executed
- Related log/report updated with evidence
```

### State Board Requirement

**State Board:** task lifecycle source of truth.
**Task body/spec notes:** execution detail.
**AFOL CLI:** formal state change and evidence path.

Do not add parallel `Task List` checkboxes for `T-xx` lifecycle state.

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
afol verify-tasks .afol/wb/<session> --strict
make doctor && make lint && make test-scripts

# Record task completion:
afol evidence --session <session> --task-id T-03 --command "make test-scripts" --result passed --artifact .afol/wb/<session>/<session>_report_01.md
afol done --session <session> --task-id T-03
```
