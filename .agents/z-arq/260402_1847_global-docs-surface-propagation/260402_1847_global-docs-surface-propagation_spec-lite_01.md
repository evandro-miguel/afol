---
doc_type: spec-lite
id: 260402_1847_global-docs-surface-propagation_spec-lite_01
theme: global-docs-surface-propagation
status: final
owners:
- orchestrator
created_at: '2026-04-02T18:47:19-03:00'
updated_at: '2026-04-02T18:55:32-03:00'
roadmap_feature: F-11
spec_role: workstream
parent_spec: 260323_1741_current-state-maps-and-goal-state-governance_spec_01
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  task: 260402_1847_global-docs-surface-propagation_task_01
risk_level: low
---

# SPEC LITE: global-docs-surface-propagation

## Intent
- Outcome: global Codex guidance, skills, plugin docs, and the local scaffold
  all teach the same repository-boundary model: project-owned docs under
  `docs/`, current-state repo maps under `docs/map/`, and agent-system surfaces
  under `.agents/`.
- Roadmap feature: `F-11`
- Parent spec: `260323_1741_current-state-maps-and-goal-state-governance_spec_01`

## Why Lite Is Enough
- The change is documentation and routing guidance, not a new runtime feature.
- The parent F-11 spec already defines the philosophy behind current-state vs
  goal-state surfaces.

## User or Operator Impact
- Primary affected user: maintainers and agents using the scaffold or the Codex
  global home
- Expected change in experience or behavior:
  - repo-map instructions converge on `docs/map/`
  - agents stop learning `.agents/arc/map/` or `docs/project-overview/` as the
    publication target
  - local runtime mirrors reflect the updated boundary model

## Boundaries
- In scope:
  - Global Codex guidance and skills that route repo-map work
  - Plugin docs and prompts that still publish repo maps to the wrong path
  - Local scaffold docs, template, and operational skill wording
- Out of scope:
  - Full relocation of `.agents/a-docs` and `.agents/arc` into `docs/`
  - Structural runtime changes beyond documentation and guidance sync

## Risks
- Overwriting runtime mirrors could erase local drift -> mitigate by treating
  `AGENTS.md` as canonical and using the supported sync command
- The scaffold still contains deeper legacy project-facing doc trees under
  `.agents/` -> mitigate by recording that debt explicitly in the report

## Acceptance
- [x] Intent is clear without code
- [x] Scope boundaries are explicit
- [x] Linked parent spec remains the source of full feature philosophy
- [x] Delivery evidence will be recorded in the report

---
*Template: `.agents/a-docs/templates/spec-lite.md`*
