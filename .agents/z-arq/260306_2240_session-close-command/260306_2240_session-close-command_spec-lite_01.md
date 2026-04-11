---
doc_type: spec-lite
id: 260306_2240_session-close-command_spec-lite_01
theme: session-close-command
status: active
owners:
- orchestrator
created_at: '2026-03-06T22:40:43-03:00'
updated_at: '2026-03-07T18:41:21-03:00'
roadmap_feature: F-08
spec_role: workstream
parent_spec: 260306_context-driven-execution-commands_spec_01
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  task: 260306_2240_session-close-command_task_01
risk_level: low
---

# SPEC LITE: session-close-command

## Intent
- Outcome: Agents can explicitly close a session by running one command that proves strict closure eligibility and, when requested, repoints the active-session pointer.
- Roadmap feature: `F-08`
- Parent spec: `260306_context-driven-execution-commands_spec_01`

## Why Lite Is Enough
- The change is localized to command orchestration and documentation.
- It reuses existing closure rules instead of changing feature philosophy.

## User or Operator Impact
- Primary affected user: agent/operator closing a completed workstream
- Expected change in experience or behavior:
  - Session closure has a first-class command instead of being an implicit combination of other steps.

## Boundaries
- In scope:
  - `session close`
  - strict verification gate reuse
  - optional active-session repointing
- Out of scope:
  - workbench archiving
  - report/postmortem auto-generation

## Risks
- Pointer churn or accidental ambiguity -> keep the current pointer unless the operator explicitly provides `--next-session`

## Acceptance
- [x] Intent is clear without code
- [x] Scope boundaries are explicit
- [x] Linked parent spec remains the source of full feature philosophy
- [x] Delivery evidence will be recorded in the report

---
*Template: `.agents/a-docs/templates/spec-lite.md`*
