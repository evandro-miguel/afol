---
doc_type: research
id: 260323_1753_execplan-native-planning-system_research_01
theme: execplan-native-planning-system
status: final
roadmap_feature: F-12
parent_spec: 260323_1815_execplan-native-planning-system_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260323_1753_execplan-native-planning-system_plan_01
created_at: '2026-03-23T17:53:45-03:00'
updated_at: '2026-03-23T18:05:33-03:00'
---

# Research: execplan-native-planning-system

## Questions
- How should this scaffold adapt the Codex ExecPlan guidance without breaking the roadmap/spec/workbench model?
- Which parts of the official guidance should become hard gates in strict verification?

## Findings
- The official OpenAI cookbook describes ExecPlans as living, self-contained, restart-safe planning documents for long-running Codex work.
- The required living sections emphasized in the source are `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective`.
- The source strongly favors observable outcomes, explicit file/command references, and self-containment for a novice reader.
- Inference from the source: for this scaffold, the right mapping is to strengthen the workbench plan file and make the verifier enforce the key sections for finalized plans.

## Sources
- `https://developers.openai.com/cookbook/articles/codex_exec_plans` | credibility: high | official OpenAI cookbook article defining the ExecPlan pattern
- `https://developers.openai.com/cookbook/examples/codex/code_modernization/` | credibility: high | official companion example showing ExecPlans in a broader Codex workflow

## Decision Impact
- Add a root `PLANS.md`.
- Upgrade the workbench plan template.
- Enforce final-plan ExecPlan sections and progress in strict verification.

## Open Unknowns
- none

---
*Template: `.agents/a-docs/templates/research.md`*
