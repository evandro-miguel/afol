---
doc_type: spec-child
id: YYMMDD_HHMM_<theme>_spec-child_01
theme: <theme>
status: draft
owners:
- orchestrator
workstream_intent: <workstream_intent>
artifact_purpose: <artifact_purpose>
created_at: YYYY-MM-DDTHH:MM:SSZ
updated_at: YYYY-MM-DDTHH:MM:SSZ
roadmap_feature: <feature_id>
spec_role: child
parent_spec: <parent_spec_id>
links:
  roadmap: <roadmap_path>
  plan: <plan_doc_id>
  task: <task_doc_id>
  report: <report_doc_id_or_empty>
risk_level: low
---

# SPEC CHILD: <theme>

## Intent

- Outcome: <what should become true>
- Roadmap feature: `<feature_id>`
- Parent spec: `<parent_spec_id>`

## Child Scope Rationale

- <why this child spec exists>
- <why this scope should stay separate from sibling child specs>

## User or Operator Journey

1. <starting point>
2. <key interaction or decision>
3. <expected outcome>

## Boundaries

- In scope:
  - <item>
- Out of scope:
  - <item>

## Risks and Mitigations

- <risk> -> <mitigation>

## Acceptance

- [ ] Child scope is explicit and bounded
- [ ] Parent spec linkage is explicit
- [ ] Journey is clear without code
- [ ] Delivery evidence target is clear in linked report

---

*Template: `docs/templates/spec-child.md`*
