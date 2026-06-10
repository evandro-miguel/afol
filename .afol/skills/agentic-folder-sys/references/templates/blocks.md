---
description: Blocking-issue template for stalled tasks within a governed workstream.
metadata:
  tags: "template, blocks, blockers, task, escalation"
---

# Blocks Template

````markdown
---
doc_type: blocks
id: "YYMMDD_HHMM_THEME_task_01_blocks"
theme: "theme"
task_id: "TASK_ID"
status: blocking
created_at: "YYYY-MM-DDTHH:MM:SSZ"
updated_at: "YYYY-MM-DDTHH:MM:SSZ"
---

# Blocks: TASK_ID

## Task Description

- ORIGINAL_TASK_DESCRIPTION

## Problem Summary

- ONE_SENTENCE_DESCRIPTION_OF_THE_BLOCK

## Error Details

```text
PASTE_ERROR_MESSAGE_OR_STACK_TRACE
```

## Context

- What was attempted: ACTION
- Expected: EXPECTED_OUTCOME
- Actual: ACTUAL_OUTCOME

## Root Cause (if known)

- ANALYSIS_OF_WHAT_CAUSED_THE_ISSUE

## Attempted Solutions

1. ATTEMPT_1 -> RESULT
2. ATTEMPT_2 -> RESULT

## Proposed Next Steps

- [ ] STEP_1
- [ ] STEP_2
- [ ] STEP_3

## Dependencies

- Blocked by: TASK_RESOURCE_OR_DECISION
- Blocks: OTHER_TASKS_AFFECTED

## Resolution

- [ ] Resolved
- Date: YYYY-MM-DD
- How: DESCRIPTION_OF_FIX
````
