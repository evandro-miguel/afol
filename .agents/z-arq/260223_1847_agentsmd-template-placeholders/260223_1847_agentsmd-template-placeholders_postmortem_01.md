---
doc_type: postmortem
id: 260223_1847_agentsmd-template-placeholders_postmortem_01
theme: agentsmd-template-placeholders
status: final
created_at: '2026-02-23T18:47:00Z'
updated_at: '2026-04-04T17:00:00Z'
links:
  plan: 260223_1847_agentsmd-template-placeholders_plan_01
  task: 260223_1847_agentsmd-template-placeholders_task_01
  report: 260223_1847_agentsmd-template-placeholders_report_01
---

# Postmortem: agentsmd-template-placeholders

## Goal
- Fix template placeholder resolution so generated workbench artifacts have concrete IDs and links.

## Expected Outcome
- `make new` produces artifacts with resolved IDs, not raw placeholders.

## What Was Achieved
- Placeholder replacement order fixed in agents-new.py; generated artifacts now have concrete values.

## What Did Not Land
- None.

## Problems Encountered
- None.

## Root Causes
- Placeholder replacement was running before ID generation.

## Useful Discoveries
- N/A

## Follow-ups for Next Rounds
- N/A

## Final Assessment
- Session outcome: successful
- Should a new feature or child spec be created from this postmortem: no

---
*Template: `docs/templates/postmortem.md`*
