---
description: Standard template for workbench plan documents.
metadata:
  tags: "template, plan, workbench"
---

```markdown
---
doc_type: plan
id: "YYMMDD_HHMM_<theme>_plan_01"
theme: "<theme_of_PRD>"
status: draft
owners: ["orchestrator"]
created_at: "YYYY-MM-DDTHH:MM:SSZ"
updated_at: "YYYY-MM-DDTHH:MM:SSZ"
---

# Plan: <theme_of_PRD>

## Objective

- <clear outcome>

## Scope

- In scope: <items>
- Out of scope: <items>

## Success Criteria

- <criterion 1>
- <criterion 2>

## Delivery Strategy

1. <phase 1>
2. <phase 2>
3. <phase 3>

## Critical Dependencies

- Tools: <critical tools only>
- MCPs: <critical MCPs only>
- Skills: <critical skills only>
- Executor instruction: Research whether additional critical dependencies are needed before execution.

## Large Plan Handling

- If this plan exceeds 500 lines, split into phases.
- Create one task file per phase using:
  - `YYMMDD_HHMM_<theme_of_PRD>_task_01.md`
  - `YYMMDD_HHMM_<theme_of_PRD>_task_02.md`

## Risks and Mitigations

- Risk: <risk> -> Mitigation: <mitigation>

## Verification Plan

- Unit: <command or N/A>
- E2E: <command or N/A>
- Other checks: <checks>
```
