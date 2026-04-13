---
description: Child workstream spec template (canonical future replacement for spec-lite).
metadata:
  tags: "template, spec-child, workstream, governance, roadmap"
---

# Spec Child Template

````markdown
---
doc_type: spec-child
id: "YYMMDD_HHMM_THEME_spec-child_01"
theme: "theme"
status: draft
owners: ["orchestrator"]
created_at: "YYYY-MM-DDTHH:MM:SSZ"
updated_at: "YYYY-MM-DDTHH:MM:SSZ"
roadmap_feature: "FEATURE_ID"
spec_role: "child"
parent_spec: "PARENT_SPEC_ID"
links:
  roadmap: "ROADMAP_PATH"
  task: "TASK_DOC_ID"
risk_level: low # low|medium|high
---

# SPEC CHILD: theme

## Intent
- Outcome: WHAT_SHOULD_BECOME_TRUE
- Roadmap feature: `FEATURE_ID`
- Parent spec: `PARENT_SPEC_ID`

## User or Operator Journey
1. STARTING_POINT
2. INTERACTION_OR_DECISION
3. EXPECTED_OUTCOME

## Boundaries
- In scope:
  - ITEM
- Out of scope:
  - ITEM

## Risks
- RISK -> MITIGATION

## Acceptance
- [ ] Child scope is explicit
- [ ] Parent spec linkage is explicit
- [ ] Journey is explicit
- [ ] Delivery evidence target is explicit
````
