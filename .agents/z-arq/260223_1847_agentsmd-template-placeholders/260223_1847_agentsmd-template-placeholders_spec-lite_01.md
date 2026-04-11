---
doc_type: spec-lite
id: 260223_1847_agentsmd-template-placeholders_spec-lite_01
theme: agentsmd-template-placeholders
status: final
owners:
- orchestrator
created_at: '2026-02-23T15:47:41-03:00'
updated_at: '2026-02-23T16:12:49-03:00'
links:
  tasks: 260223_1847_agentsmd-template-placeholders_task_01
  plan: 260223_1847_agentsmd-template-placeholders_plan_01
  report: 260223_1847_agentsmd-template-placeholders_report_01
risk_level: low
---

# SPEC LITE: agentsmd-template-placeholders

## Objective
- Ensure root AGENTS is template-only, with placeholders and no concrete repo tooling catalog.

## Change Summary
- Rewrote `AGENTS.md` as generic scaffold.
- Removed populated entries for stack, tools, skills, and MCPs.
- Kept section structure requested by the user.

## Files and Areas
- `AGENTS.md`
- `QWEN.md`
- `CLAUDE.md`
- `GEMINI.md`
- `.agents/a-docs/lessons/general-lessons.md`

## Risks
- Template may drift to filled content in future edits -> mitigated with added lessons/prevention rule.

## Verification
- Commands:
  - `make sync`
  - `make lint`
  - `make verify`
- Evidence:
  - Captured in `260223_1847_agentsmd-template-placeholders_report_01`.

## Done When
- [x] Verified with commands
- [x] No regressions observed
- [x] Report updated with evidence

---
*Template: `.agents/a-docs/templates/spec-lite.md`*
