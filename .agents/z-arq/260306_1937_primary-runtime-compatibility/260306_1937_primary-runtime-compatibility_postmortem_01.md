---
doc_type: postmortem
id: 260306_1937_primary-runtime-compatibility_postmortem_01
theme: primary-runtime-compatibility
status: final
created_at: '2026-03-06T19:37:00Z'
updated_at: '2026-04-04T17:00:00Z'
links:
  plan: 260306_1937_primary-runtime-compatibility_plan_01
  task: 260306_1937_primary-runtime-compatibility_task_01
  report: 260306_1937_primary-runtime-compatibility_report_01
---

# Postmortem: primary-runtime-compatibility

## Goal
- Add first-class OpenCode support and document the primary runtime compatibility contract for OpenCode, Codex, and Qwen.

## Expected Outcome
- OpenCode treated as first-class runtime; runtime health checks and tool discovery parity.

## What Was Achieved
- 4/5 tasks completed (T-04 intentionally skipped as out-of-scope); OpenCode support added to sync/bootstrap/runtime docs; runtime compatibility contract defined.

## What Did Not Land
- T-04 skipped: spec-lite and child-spec thresholds belong to roadmap features F-02/F-03.

## Problems Encountered
- None.

## Root Causes
- N/A

## Useful Discoveries
- N/A

## Follow-ups for Next Rounds
- N/A

## Final Assessment
- Session outcome: successful
- Should a new feature or child spec be created from this postmortem: no

---
*Template: `docs/templates/postmortem.md`*
