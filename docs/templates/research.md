---
doc_type: research
id: YYMMDD_HHMM_<theme>_research_01
theme: <theme>
status: draft
owners:
- researcher
workstream_intent: <workstream_intent>
artifact_purpose: <artifact_purpose>
roadmap_feature: <feature_id>
parent_spec: <parent_spec_id>
child_spec: <child_spec_id_or_empty>
links:
  roadmap: <roadmap_path>
  plan: <plan_doc_id>
created_at: YYYY-MM-DDTHH:MM:SSZ
updated_at: '2026-04-04T10:08:11-03:00'
output_artifacts:
  primary:
    research: YYMMDD_HHMM_<theme>_research_01
  links:
    roadmap: <roadmap_path>
    plan: <plan_doc_id>
    task: <task_doc_id_or_empty>
    report: <report_doc_id_or_empty>
    postmortem: <postmortem_doc_id_or_empty>
  sidecar_justification: <required|not_required>
---

# Research: <theme>

## Questions

- <question 1>
- <question 2>

## Findings

- <finding 1>
- <finding 2>

## Sources

- <path/url/reference> | credibility: <high/med/low> | notes: <why it matters>

## Decision Impact

- <how findings affect implementation>

## Open Unknowns

- <unknown that still blocks action>

## Output Artifact Contract

- If this sidecar exists, record `sidecar_justification` as `required`.
- If not required, set `sidecar_justification` to `not_required` and still keep
  the field explicit.

## Sidecar Justification

- Blocking question: <question this sidecar must answer>
- Decision produced: <decision or N/A until answered>
- Execution task affected: <T-XX>
- Stop condition: <what makes this sidecar complete>

---

*Template: `docs/templates/research.md`*
