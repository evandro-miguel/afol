---
doc_type: report
id: "YYMMDD_HHMM_<theme>_report_01"
theme: "<theme>"
status: final
created_at: "YYYY-MM-DDTHH:MM:SSZ"
updated_at: "YYYY-MM-DDTHH:MM:SSZ"
roadmap_feature: "<feature_id>"
parent_spec: "<parent_spec_id>"
child_spec: "<child_spec_id_or_empty>"
related_tasks: ["<optional_task_id>"]
links:
  roadmap: "<roadmap_path>"
  plan: "<plan_doc_id>"
  task: "<task_doc_id>"
  postmortem: "<postmortem_doc_id>"
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

## Verification
- Unit tests: `<command>` -> <pass/fail> -> Evidence: <snippet/link>
- E2E tests: `<command>` -> <pass/fail> -> Evidence: <snippet/link>
- Typecheck: `<command>` -> <pass/fail> -> Evidence: <snippet/link>
- Lint: `<command>` -> <pass/fail> -> Evidence: <snippet/link>
- Additional checks:
  - <check> -> <result> -> Evidence: <snippet/link>

## Risks / Follow-ups
- <open item>

## Postmortem Link
- Postmortem: `<postmortem_doc_id>`

## Lessons (if any)
- <what to avoid next time>

---
*Template: `.agents/a-docs/templates/report.md`*
