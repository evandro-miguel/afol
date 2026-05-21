---
doc_type: report
id: YYMMDD_HHMM_<theme>_report_01
theme: <theme>
status: final
owners:
- orchestrator
workstream_intent: <workstream_intent>
artifact_purpose: <artifact_purpose>
created_at: YYYY-MM-DDTHH:MM:SSZ
updated_at: '2026-04-04T10:08:11-03:00'
roadmap_feature: <feature_id>
parent_spec: <parent_spec_id>
child_spec: <child_spec_id_or_empty>
related_tasks:
- <optional_task_id>
links:
  roadmap: <roadmap_path>
  plan: <plan_doc_id>
  task: <task_doc_id>
  postmortem: <postmortem_doc_id_or_empty>
output_artifacts:
  primary:
    report: YYMMDD_HHMM_<theme>_report_01
    task: <task_doc_id>
  sidecars:
    brainstorm: <brainstorm_doc_id_or_empty>
    research: <research_doc_id_or_empty>
    explorer_check: <explorer_check_doc_id_or_empty>
    postmortem: <postmortem_doc_id_or_empty>
  sidecar_justification:
    brainstorm: <required|not_required>
    research: <required|not_required>
    explorer_check: <required|not_required>
    postmortem: <required|not_required>
---

# Report: <theme>

## Governance Context

- Roadmap feature: `<feature_id>`
- Parent spec: `<parent_spec_id>`
- Child spec: `<child_spec_id_or_empty>`

## Summary

- <high-level outcome>

## Delivered Changes

- <change 1>
- <change 2>

## Files Changed

- <path>
- <path>

## Optional Artifacts

- Brainstorm: `<brainstorm_doc_id_or_empty>` -> `<draft|final|not created>`
- Research: `<research_doc_id_or_empty>` -> `<draft|final|not created>`
- Explorer check: `<explorer_check_doc_id_or_empty>` -> `<draft|final|not created>`
- Postmortem: `<postmortem_doc_id_or_empty>` -> `<draft|final|not created>`

## Verification

- Unit tests: `<command>` -> <pass/fail> -> Evidence: <snippet/link>
- E2E tests: `<command>` -> <pass/fail> -> Evidence: <snippet/link>
- Typecheck: `<command>` -> <pass/fail> -> Evidence: <snippet/link>
- Lint: `<command>` -> <pass/fail> -> Evidence: <snippet/link>
- Additional checks:
  - <check> -> <result> -> Evidence: <snippet/link>

## Risks / Follow-ups

- <open item>

## Output Artifacts (file-first)

- Primary artifact: `report`
- Sidecars:
  - brainstorm: `<brainstorm_doc_id_or_empty>`
  - research: `<research_doc_id_or_empty>`
  - explorer_check: `<explorer_check_doc_id_or_empty>`
  - postmortem: `<postmortem_doc_id_or_empty>`
- Sidecar justification:
  - Provide one value per optional artifact, or `not_required`.

## Postmortem Link

- Postmortem: `<postmortem_doc_id_or_empty>` if created

## Lessons (if any)

- <what to avoid next time>

---

*Template: `docs/templates/report.md`*
