---
doc_type: lesson_entry
id: lesson_20260223_1905_script-corrections-from-review
status: active
created_at: '2026-02-23T00:00:00Z'
updated_at: '2026-02-23T18:44:52-03:00'
source: user_correction
---

# Lesson: Script Correctness Must Be Verified in Source

## Correction

The user reported script-level defects that were not fully caught by config-level checks.

## Prevention Rule

Before closing operational improvements, inspect script internals for behavioral correctness in non-interactive, edge-path, and scaffold flows.

## Guardrail

Add script-level smoke checks for:
- non-interactive execution paths
- scaffold completeness (plan/task/log/report)
- placeholder expansion consistency
- active session pointer integrity
