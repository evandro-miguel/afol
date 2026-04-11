---
description: Standard template for workbench task tracking documents.
metadata:
  tags: "template, task, workbench"
---

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

## Task List

-[] T-001 <task description>
-[] T-002 <task description>

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-001 | -[] | build | pending |

## State Marker Rules

- `-[]` pending
- `-[/]` in progress
- `-[x]` completed
- Set `-[/]` when execution starts.
- Set `-[x]` when execution finishes.

## Test Gate

- Move to `ready_for_test` only after implementation checkpoint.
- Record test command, result, and evidence before marking `done`.
```
