---
doc_type: plan
id: "YYMMDD_HHMM_<theme>_plan_01"
theme: "<theme>"
status: draft
owners: ["orchestrator"]
created_at: "YYYY-MM-DDTHH:MM:SSZ"
updated_at: "YYYY-MM-DDTHH:MM:SSZ"
roadmap_feature: "<feature_id>"
parent_spec: "<parent_spec_id>"
child_spec: "<child_spec_id_or_empty>"
links:
  roadmap: "<roadmap_path>"
  brainstorm: "<brainstorm_doc_id>"
  explorer_check: "<explorer_check_doc_id>"
  research: "<research_doc_id>"
  task: "<task_doc_id>"
repo: "<repo_name>"
branch: "<branch_or_worktree>"
---

# Plan: <theme>

## Objective
- Deliver work for roadmap feature `<feature_id>` within the boundaries defined by parent spec `<parent_spec_id>`.

## Scope
- In scope:
  - <item>
- Out of scope:
  - <item>

## Governance Context
- Roadmap feature: `<feature_id>`
- Parent spec: `<parent_spec_id>`
- Child spec: `<child_spec_id_or_empty>`
- Planning rule:
  - Do not redefine feature philosophy here; use this file to plan execution of already-defined intent.
  - A major plan is not complete until brainstorm and explorer-check artifacts exist and are linked here.

## Planning Inputs
- Brainstorm artifact: `<brainstorm_doc_id>`
- Explorer check artifact: `<explorer_check_doc_id>`
- Research artifact: `<research_doc_id>`
- Knowledge lookup performed:
  - <command/result or prior docs reviewed>

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

## Completion Gate
- [ ] Brainstorm exists and reflects real option analysis
- [ ] Explorer check proves current-project inspection happened
- [ ] Relevant prior knowledge was searched or explicitly ruled out
- [ ] Verification path is concrete enough to execute without guesswork

---
*Template: `.agents/a-docs/templates/plan.md`*
