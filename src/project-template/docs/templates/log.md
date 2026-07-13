---
doc_type: log
id: YYMMDD_HHMM_<theme>_log_01
theme: <theme>
status: active
owners:
- orchestrator
workstream_intent: <workstream_intent>
artifact_purpose: <artifact_purpose>
created_at: YYYY-MM-DDTHH:MM:SSZ
updated_at: '2026-04-04T10:08:11-03:00'
roadmap_feature: <feature_id>
parent_spec: <parent_spec_id>
child_spec: <child_spec_id_or_empty>
links:
  roadmap: <roadmap_path>
  plan: <plan_doc_id>
  task: <task_doc_id>
---

# Log: <theme>

## Governance Context

- Roadmap feature: `<feature_id>`
- Parent spec: `<parent_spec_id>`
- Child spec: `<child_spec_id_or_empty>`

## Timeline

- YYYY-MM-DD HH:MMZ - <action> - <result>
- YYYY-MM-DD HH:MMZ - <action> - <result>

## Decisions

- <decision> -> <reason>

## Closure / Benchmark State (when applicable)

- Report status: `<created|existing|waived|missing|not_applicable>`
- Summary source or waiver reason: `<value_or_not_applicable>`
- Benchmark profile: `<pack/run_id/samples/baseline_or_not_applicable>`
- Observed artifact: `<path_or_not_applicable>`

## Blockers

- <blocker or none>

## Next Step

- <next action>

---

*Template: `docs/templates/log.md`*
