---
description: Reference template for closing a governed workbench session with reusable lessons.
metadata:
  tags: "template, postmortem, workbench"
---

```markdown
---
doc_type: postmortem
id: "YYMMDD_HHMM_<theme>_postmortem_01"
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
  plan: "<plan_doc_id>"
  task: "<task_doc_id>"
  report: "<report_doc_id_or_empty>"
---

# Postmortem: <theme>

## Goal
- Capture what happened in the session so future agents can reuse the real outcome instead of reconstructing it.

## Expected Outcome
- <what the session was trying to accomplish>

## What Was Achieved
- <delivered outcome>

## What Did Not Land
- <missed item>

## Problems Encountered
- <problem>

## Root Causes
- <cause>

## Useful Discoveries
- <reusable info>

## Follow-ups for Next Rounds
- <follow-up>

## Final Assessment
- Session outcome: <successful/partial/blocked>
- Should a new feature or child spec be created from this postmortem: <yes/no>
```
