---
doc_type: spec-lite
id: 260306_1937_primary-runtime-compatibility_spec-lite_01
theme: primary-runtime-compatibility
status: draft
owners:
- orchestrator
created_at: '2026-03-06T19:37:14-03:00'
updated_at: '2026-03-06T19:49:56-03:00'
roadmap_feature: F-06
spec_role: workstream
parent_spec: 260306_primary-agent-runtime-compatibility_spec_01
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  task: 260306_1937_primary-runtime-compatibility_task_01
risk_level: low
---

# SPEC LITE: primary-runtime-compatibility

## Intent
- Outcome: The scaffold supports OpenCode, Codex, and Qwen through a documented, secret-free runtime compatibility contract with OpenCode treated as a first-class runtime.
- Roadmap feature: `F-06`
- Parent spec: `260306_primary-agent-runtime-compatibility_spec_01`

## Why Lite Is Enough
- The work stays in the adapter and governance layer rather than redefining the broader roadmap-first architecture.
- The parent spec already defines the full philosophy; this workstream implements one bounded compatibility slice of it.

## User or Operator Impact
- Primary affected user: repository owners and agents entering the repo via OpenCode, Codex, or Qwen
- Expected change in experience or behavior:
  - Runtime entrypoints are clearer and more consistent across the primary supported runtimes.
  - OpenCode support no longer depends on implicit or out-of-band knowledge.

## Boundaries
- In scope:
  - OpenCode-first repo files, sync/bootstrap updates, and compatibility standards
- Out of scope:
  - user-local auth setup and provider-specific credentials

## Risks
- Runtime files drift from canonical governance -> keep adapters thin and synced from `AGENTS.md` where possible

## Acceptance
- [ ] Intent is clear without code
- [ ] Scope boundaries are explicit
- [ ] Linked parent spec remains the source of full feature philosophy
- [ ] Delivery evidence will be recorded in the report

---
*Template: `.agents/a-docs/templates/spec-lite.md`*
