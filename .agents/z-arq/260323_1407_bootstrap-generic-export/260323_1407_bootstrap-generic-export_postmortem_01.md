---
doc_type: postmortem
id: 260323_1407_bootstrap-generic-export_postmortem_01
theme: bootstrap-generic-export
status: final
owners:
- orchestrator
created_at: '2026-03-23T14:07:57-03:00'
updated_at: '2026-03-23T14:18:47-03:00'
roadmap_feature: F-04
parent_spec: 260306_roadmap-first-delivery-system_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260323_1407_bootstrap-generic-export_plan_01
  task: 260323_1407_bootstrap-generic-export_task_01
  report: 260323_1407_bootstrap-generic-export_report_01
---

# Postmortem: bootstrap-generic-export

## Goal
- Capture what happened in the session so future agents can reuse the real outcome instead of reconstructing it.

## Expected Outcome
- Make bootstrap exports safe for reuse as a downstream-project base without carrying this repo's local operational state.

## What Was Achieved
- Delivered a sanitized bootstrap path that copies reusable system assets, generates starter governance docs, and omits scaffold-local workbench/knowledge/lesson/report history.
- Proved the real bootstrap path works end-to-end in a fresh target repo.

## What Did Not Land
- No additional cleanup was done for optional upstream skill docs because they were outside the bootstrap contract and non-blocking.

## Problems Encountered
- The first generated roadmap used template spec placeholders, which caused the target repo's `doctor` to fail during bootstrap post-checks.

## Root Causes
- A generic roadmap baseline still has to satisfy the scaffold's governance validation, which requires real parent spec files to exist.

## Useful Discoveries
- Sanitizing copied trees is not enough; generated governance baselines must be internally valid against `doctor`.
- The real bootstrap path with post-checks is mandatory validation because unit tests alone did not catch the initial roadmap/spec mismatch.

## Follow-ups for Next Rounds
- Keep runtime regression tests aligned whenever new generated or historical doc families are added under `.agents/`.
- Consider whether optional skill-doc warnings should be filtered or normalized for cleaner downstream lint output.

## Final Assessment
- Session outcome: successful
- Should a new feature or child spec be created from this postmortem: no

---
*Template: `.agents/a-docs/templates/postmortem.md`*
