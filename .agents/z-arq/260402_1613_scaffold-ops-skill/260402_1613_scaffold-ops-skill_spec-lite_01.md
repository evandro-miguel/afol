---
doc_type: spec-lite
id: 260402_1613_scaffold-ops-skill_spec-lite_01
theme: scaffold-ops-skill
status: final
owners:
- orchestrator
created_at: '2026-04-02T16:13:52-03:00'
updated_at: '2026-04-02T16:49:35-03:00'
roadmap_feature: F-10
spec_role: workstream
parent_spec: 260323_1704_universal-skills-runtime-integration_spec_01
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  task: 260402_1613_scaffold-ops-skill_task_01
risk_level: low
---

# SPEC LITE: scaffold-ops-skill

## Intent
- Outcome: the scaffold can be operated through a canonical local skill, fresh
  bootstrap paths are easier, and repo-local skill sources stay coherent while
  still cooperating with a git-backed catalog.
- Roadmap feature: `F-10`
- Parent spec: `260323_1704_universal-skills-runtime-integration_spec_01`

## Why Lite Is Enough
- The work stays inside the existing F-10 contract for local-first bootstrap and
  git-backed skill refresh/publish.
- No new product area was introduced; this is execution hardening and operator
  UX cleanup on top of an existing parent spec.

## User or Operator Impact
- Primary affected user: agent operators and downstream repos that adopt this scaffold
- Expected change in experience or behavior:
  - Agents can discover upstream skills from the git-backed catalog when present.
  - `ensure` works against an existing git mirror instead of failing against a
    subset local seed.
  - Full bootstrap can create a new target directory directly.
  - The repo-local seed no longer advertises profiles it cannot satisfy.

## Boundaries
- In scope:
  - Runtime and doc fixes for `skills-sync`, local source integrity, and bootstrap UX
- Out of scope:
  - New plugin packaging or large workflow redesign

## Risks
- Behavior drift between local seed and git mirror -> mitigate with local-source
  metadata synthesis plus guard/test coverage

## Acceptance
- [x] Intent is clear without code
- [x] Scope boundaries are explicit
- [x] Linked parent spec remains the source of full feature philosophy
- [x] Delivery evidence will be recorded in the report

---
*Template: `.agents/a-docs/templates/spec-lite.md`*
