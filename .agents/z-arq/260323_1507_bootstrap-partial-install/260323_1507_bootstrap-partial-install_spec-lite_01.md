---
doc_type: spec-lite
id: 260323_1507_bootstrap-partial-install_spec-lite_01
theme: bootstrap-partial-install
status: final
owners:
- orchestrator
created_at: '2026-03-23T15:07:03-03:00'
updated_at: '2026-03-23T15:24:34-03:00'
roadmap_feature: F-04
spec_role: workstream
parent_spec: 260306_roadmap-first-delivery-system_spec_01
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  task: 260323_1507_bootstrap-partial-install_task_01
risk_level: low
---

# SPEC LITE: bootstrap-partial-install

## Intent
- Outcome: the scaffold installs cleanly in both fresh repos and already-running repos, with an explicit partial-install path for adoption scenarios.
- Roadmap feature: `F-04`
- Parent spec: `260306_roadmap-first-delivery-system_spec_01`

## Why Lite Is Enough
- The change is localized to bootstrap/install behavior, validation hygiene, and operator-facing documentation.
- The parent spec already defines the broader roadmap-first delivery philosophy, so this workstream only needs execution-level clarification.

## User or Operator Impact
- Primary affected user: operators adopting the scaffold in a new or existing repository.
- Expected change in experience or behavior:
  - operators can call `./.agents/agents bootstrap <repo> --partial` or `make bootstrap TARGET=<repo> PARTIAL=1` without clobbering project-owned files
  - bootstrapped targets validate cleanly without requiring manual cleanup of installer-created warnings

## Boundaries
- In scope:
  - explicit `--partial` install mode
  - adoption-oriented generated baseline for existing projects
  - cleanup of bootstrap-created doctor/lint noise
  - documentation and test coverage for the new install contract
- Out of scope:
  - inferring the target project's real roadmap, specs, or backlog automatically

## Risks
- Existing-project placeholders could be mistaken for final governance content -> document the adoption baseline clearly and require human replacement before substantive delivery work

## Acceptance
- [x] Intent is clear without code
- [x] Scope boundaries are explicit
- [x] Linked parent spec remains the source of full feature philosophy
- [x] Delivery evidence will be recorded in the report

---
*Template: `.agents/a-docs/templates/spec-lite.md`*
