---
description: Legacy compatibility template for workstream spec-lite artifacts.
metadata:
  tags: "template, spec-lite, legacy, workstream, governance"
---

# Spec Lite Template (Legacy Alias)

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

# SPEC LITE (LEGACY ALIAS): theme

## Migration Note
- `spec-child` is the canonical future name.
- Use `spec-lite` only when historical compatibility is required.

## Intent
- Outcome: WHAT_SHOULD_BECOME_TRUE
- Roadmap feature: `FEATURE_ID`
- Parent spec: `PARENT_SPEC_ID`

## Boundaries
- In scope:
  - ITEM
- Out of scope:
  - ITEM

## Risks
- RISK -> MITIGATION

## Acceptance
- [ ] Scope is explicit
- [ ] Parent linkage is explicit
- [ ] Migration note is explicit
- [ ] Delivery evidence target is explicit
````
