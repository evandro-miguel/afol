---
description: Lightweight workstream spec template for localized governed delivery.
metadata:
  tags: "template, spec-lite, workstream, governance, roadmap"
---

# Spec Lite Template

````markdown
---
doc_type: spec-lite
id: "YYMMDD_HHMM_THEME_spec-lite_01"
theme: "theme"
status: draft
owners: ["orchestrator"]
created_at: "YYYY-MM-DDTHH:MM:SSZ"
updated_at: "YYYY-MM-DDTHH:MM:SSZ"
roadmap_feature: "FEATURE_ID"
spec_role: "workstream"
parent_spec: "PARENT_SPEC_ID"
links:
  roadmap: "ROADMAP_PATH"
  task: "TASK_DOC_ID"
risk_level: low # low|medium|high
---

# SPEC LITE: theme

## Intent
- Outcome: WHAT_SHOULD_BECOME_TRUE
- Roadmap feature: `FEATURE_ID`
- Parent spec: `PARENT_SPEC_ID`

## Why Lite Is Enough
- WHY_THIS_WORK_IS_LOCALIZED_OR_LOW_RISK
- WHY_A_FULL_CHILD_SPEC_IS_NOT_NEEDED

## User or Operator Impact
- Primary affected user: WHO
- Expected change in experience or behavior:
  - CHANGE

## Boundaries
- In scope:
  - ITEM
- Out of scope:
  - ITEM

## Risks
- RISK -> MITIGATION

## Acceptance
- [ ] Intent is clear without code
- [ ] Scope boundaries are explicit
- [ ] Linked parent spec remains the source of full feature philosophy
- [ ] Delivery evidence will be recorded in the report
````
