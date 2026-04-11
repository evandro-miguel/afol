---
doc_type: spec-lite
id: 260223_1839_agentsmd-generic-reframe_spec-lite_01
theme: agentsmd-generic-reframe
status: final
owners:
- orchestrator
created_at: '2026-02-23T15:39:42-03:00'
updated_at: '2026-02-23T16:12:49-03:00'
links:
  tasks: 260223_1839_agentsmd-generic-reframe_task_01
  plan: 260223_1839_agentsmd-generic-reframe_plan_01
  report: 260223_1839_agentsmd-generic-reframe_report_01
risk_level: low
---

# SPEC LITE: agentsmd-generic-reframe

## Objective
- Rebuild root `AGENTS.md` into a reusable generic template structure with current repo values.

## Change Summary
- Replaced root `AGENTS.md` with requested section flow and updated rules.
- Preserved operational constraints and current command set.
- Added explicit skills/MCP/tooling sections in a reusable format.

## Files and Areas
- `AGENTS.md`
- `.agents/a-docs/lessons/general-lessons.md`
- `.agents/wb/260223_1839_agentsmd-generic-reframe/*`

## Risks
- Future edits may drift from generic-first approach -> mitigated by lesson/prevention rule update.

## Verification
- Commands:
  - `make lint`
  - `make sync`
  - `make verify`
- Evidence:
  - Captured in `260223_1839_agentsmd-generic-reframe_report_01`.

## Done When
- [x] Verified with commands
- [x] No regressions observed
- [x] Report updated with evidence

---
*Template: `.agents/a-docs/templates/spec-lite.md`*
