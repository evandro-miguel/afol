---
doc_type: spec-lite
id: 260323_1753_execplan-native-planning-system_spec-lite_01
theme: execplan-native-planning-system
status: final
owners:
- orchestrator
created_at: '2026-03-23T17:53:45-03:00'
updated_at: '2026-03-23T18:05:33-03:00'
roadmap_feature: F-12
spec_role: workstream
parent_spec: 260323_1815_execplan-native-planning-system_spec_01
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  task: 260323_1753_execplan-native-planning-system_task_01
risk_level: low
---

# SPEC LITE: execplan-native-planning-system

## Intent
- Outcome: the scaffold plan system behaves like an ExecPlan system for major work while still using the workbench as its canonical storage model.
- Roadmap feature: `F-12`
- Parent spec: `260323_1815_execplan-native-planning-system_spec_01`

## Why Lite Is Enough
- The work is localized to planning docs, verifier logic, bootstrap export, and tests.
- The parent spec already captures the broader product philosophy.

## User or Operator Impact
- Primary affected user: operators running interactive CLI agents in governed workstreams.
- Expected change in experience or behavior:
  - plan files become stronger living execution documents
  - strict closure catches weak finalized plans

## Boundaries
- In scope:
  - root `PLANS.md`
  - plan template and verifier hardening
  - bootstrap export and operator docs
- Out of scope:
  - replacing the scaffold's governance tree

## Risks
- stronger plan rules could be too rigid -> enforce only for finalized plans in strict mode

## Acceptance
- [x] Intent is clear without code
- [x] Scope boundaries are explicit
- [x] Linked parent spec remains the source of full feature philosophy
- [x] Delivery evidence will be recorded in the report

---
*Template: `.agents/a-docs/templates/spec-lite.md`*
