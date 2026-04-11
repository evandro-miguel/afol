---
doc_type: plan
id: "YYMMDD_HHMM_<theme>_plan_01"
theme: "<theme>"
status: draft
owners: ["orchestrator"]
created_at: "YYYY-MM-DDTHH:MM:SSZ"
updated_at: "YYYY-MM-DDTHH:MM:SSZ"
repo: "<repo_name>"
branch: "<branch_or_worktree>"
---

# Plan: <theme>

## Objective

- <clear outcome in one sentence>

## Scope

- In scope:
  - <item>
- Out of scope:
  - <item>

## Success Criteria

- <measurable criterion 1>
- <measurable criterion 2>

## Delivery Strategy

1. <phase 1>
2. <phase 2>
3. <phase 3>

## Critical Dependencies

- Tools:
  - <critical only>
- MCPs:
  - <critical only>
- Skills:
  - <critical only>
- Executor instruction:
  - Research whether additional critical dependencies are needed before execution.

## Large Plan Handling

- If this plan exceeds 500 lines, split into phases.
- Create one task file per phase.

## Risks and Mitigations

- Risk: <risk> -> Mitigation: <mitigation>

## Verification Plan

- Unit: <command or N/A>
- E2E: <command or N/A>
- Typecheck: <command or N/A>
- Lint: <command or N/A>
- Other checks:
  - <check + how to prove>

---

*Template: `.agents/a-docs/templates/plan.md`*
