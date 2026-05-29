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
New tasks must start `[ ]` or `[/]`; do not seed new work as `[x]`.

## Task List

- [ ] T-001 <task description>
- [ ] T-002 <task description>

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-001 | pending | build | <notes> |

## State Marker Rules

- `[ ]` pending
- `[/]` in progress
- `[!]` problem
- `[>]` moved; Notes must include destination + reason
- `[%]` implemented_untested
- `[&]` tested_needs_spec_validation
- `[x]` done
- Set `[/]` when execution starts.
- Set `[x]` only when task-scoped `.evidence.jsonl` closure evidence exists,
  the task references the returned evidence id, and validation is complete.
  Record `N/A` in the evidence ledger when validation does not apply.
- Use `[>]` only with a concrete destination and reason.

## Test Gate

- Move to `[%]` only after the implementation checkpoint.
- Move to `[&]` only after runtime validation passes.
- Record command, result, artifact, and evidence id before `[x]`.
- If validation does not apply, write `N/A` in the evidence ledger before `[x]`.
```
