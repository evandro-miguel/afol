---
doc_type: postmortem
id: YYMMDD_HHMM_<theme>_postmortem_01
theme: <theme>
status: draft
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
  report: <report_doc_id_or_empty>
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

## Optional Artifacts Inventory

- Brainstorm: `<brainstorm_doc_id_or_empty>` -> `<draft|final|not created>`
- Research: `<research_doc_id_or_empty>` -> `<draft|final|not created>`
- Explorer check: `<explorer_check_doc_id_or_empty>` -> `<draft|final|not created>`
- Any other optional artifact: `<artifact_id_or_empty>` -> `<draft|final|not created>`

## Problems Encountered

- <problem>

## Root Causes

- <cause>

## Useful Discoveries

- <reusable info>

## Follow-ups for Next Rounds

- <follow-up>

## Governance Promotion Review

- Lesson entry needed: <yes/no>
- Rule update needed: <yes/no>
- ADR or decision record needed: <yes/no>
- Skill or doc update needed: <yes/no>
- Evidence reviewed: <artifact ids, commands, or paths>
- Follow-up recorded: <yes/no>

## Final Assessment

- Session outcome: <successful/partial/blocked>
- Should a new feature or child spec be created from this postmortem: <yes/no>
- Optional artifacts present were finalized before closure: <yes/no>

---

*Template: `docs/templates/postmortem.md`*
