---
description: Standard template for workbench plan documents.
metadata:
  tags: "template, plan, workbench"
---

# Plan Template

## Output Artifacts (file-first)

- Primary artifact: `plan`
- Sidecars:
  - brainstorm, research, explorer-check, postmortem
- Sidecar justification:
  - required|not_required per optional artifact

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

## Execution Contract

- Every step must be an action an agent can execute now.
- If discovery is still needed, do it before the plan or reduce it to the
  smallest blocking proof.
- Do not use the plan to restate feature philosophy; keep that in roadmap/spec.
- Do not add a phase whose only purpose is to create another plan, gather
  broad context, or run generic research.

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

- Each phase must be directly executable and outcome-focused.
- If a discovery step is unavoidable, make it the smallest blocking proof and
  state the decision or artifact it must produce.

## Critical Dependencies

- Tools: <critical tools only>
- MCPs: <critical MCPs only>
- Skills: <critical skills only>
- Executor instruction: if a critical dependency is discovered during
  execution, record the concrete finding and update risks or validation; do not
  add a generic research phase to this plan.

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
