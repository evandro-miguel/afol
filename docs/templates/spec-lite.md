---
doc_type: spec-lite
id: YYMMDD_HHMM_<theme>_spec-lite_01
theme: <theme>
status: draft
owners:
- orchestrator
workstream_intent: <workstream_intent>
artifact_purpose: <artifact_purpose>
created_at: YYYY-MM-DDTHH:MM:SSZ
updated_at: YYYY-MM-DDTHH:MM:SSZ
roadmap_feature: <feature_id>
spec_role: workstream
parent_spec: <parent_spec_id>
links:
  roadmap: <roadmap_path>
  task: <task_doc_id>
risk_level: low
---

# SPEC LITE (LEGACY ALIAS): <theme>

## Migration Note

- `spec-child` is the canonical future child-spec name.
- Keep `spec-lite` only for historical compatibility or toolchains that still emit `spec-lite`.

## Intent

- Outcome: <what should become true>
- Roadmap feature: `<feature_id>`
- Parent spec: `<parent_spec_id>`

## Why This Scope Is Small

- <why this work is localized or low risk>
- <why a full parent-level spec is not needed>

## User or Operator Impact

- Primary affected user: <who>
- Expected change in experience or behavior:
  - <change>

## Boundaries

- In scope:
  - <item>
- Out of scope:
  - <item>

## Risks

- <risk> -> <mitigation>

## Acceptance

- [ ] Scope is explicit and bounded
- [ ] Parent spec linkage is explicit
- [ ] Migration note is explicit
- [ ] Delivery evidence will be recorded in the report

---

*Template: `docs/templates/spec-lite.md`*
