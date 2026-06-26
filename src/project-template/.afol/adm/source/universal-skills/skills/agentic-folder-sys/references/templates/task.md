---
description: Standard template for workbench task tracking documents.
metadata:
  tags: "template, task, workbench"
---

# Task Template

```markdown
---
doc_type: task
id: "YYMMDD_HHMM_<theme>_task_01"
theme: "<theme_of_PRD>"
status: active
owners: ["worker", "tester"]
created_at: "YYYY-MM-DDTHH:MM:SSZ"
updated_at: "YYYY-MM-DDTHH:MM:SSZ"
---

# Tasks: <theme_of_PRD>

Each task must be executable by an agent now. Do not create task items whose
only purpose is to make the plan, research the plan, or gather broad context.
New tasks must start as `pending` in the State Board unless work is already
active.

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-001 | pending | build | <notes> |
| T-002 | pending | test | <notes> |

## State Rules

- `pending`: not started.
- `in_progress`: active execution.
- `problem`: real blocker exists.
- `moved`: deferred; Notes must include destination + reason.
- `implemented_untested`: implementation checkpoint complete.
- `tested_needs_spec_validation`: runtime validation passed, acceptance still
  pending.
- `done`: closure evidence exists and validation is complete or explicitly N/A.
- State source of truth is this board plus AFOL lifecycle commands. Do not add
  parallel `T-xx` checkbox rows.

## Test Gate

- Move to `implemented_untested` only after the implementation checkpoint.
- Move to `tested_needs_spec_validation` only after runtime validation passes.
- Record command, result, artifact, and evidence id before `done`.
- If validation does not apply, write `N/A` in the evidence ledger before
  `done`.
```
