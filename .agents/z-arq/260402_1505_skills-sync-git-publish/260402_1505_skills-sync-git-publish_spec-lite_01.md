---
doc_type: spec-lite
id: 260402_1505_skills-sync-git-publish_spec-lite_01
theme: skills-sync-git-publish
status: final
owners:
- orchestrator
created_at: '2026-04-02T15:05:32-03:00'
updated_at: '2026-04-02T15:21:55-03:00'
roadmap_feature: F-10
spec_role: workstream
parent_spec: 260323_1704_universal-skills-runtime-integration_spec_01
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  task: 260402_1505_skills-sync-git-publish_task_01
risk_level: low
---

# SPEC LITE: skills-sync-git-publish

## Intent
- Outcome: seeded repos can refresh selected skills from git without losing the
  local-first bootstrap contract, and operators can explicitly publish selected
  local skill edits back to the universal-skills git source.
- Roadmap feature: `F-10`
- Parent spec: `260323_1704_universal-skills-runtime-integration_spec_01`

## Why Lite Is Enough
- The strategic direction already lives in the parent F-10 spec.
- This slice is a bounded CLI/runtime refinement, not a new feature family.

## User or Operator Impact
- Primary affected user: operators maintaining project-local skills in scaffolded repos
- Expected change in experience or behavior:
  - `skills-sync sync` / `update` can refresh project skills from git even when the preferred local source is just a seed.
  - `skills-sync push` can publish selected local skill edits back to the git-backed source.

## Boundaries
- In scope:
  - Git mirror refresh for seeded repos
  - `skills-sync push`
  - Contract/doc updates
- Out of scope:
  - Full branch/PR automation for universal-skills publishing

## Risks
- Breaking current `pull` expectations -> keep `pull` as source refresh only
- Accidental remote mutation -> keep commit/push explicit

## Acceptance
- [x] Intent is clear without code
- [x] Scope boundaries are explicit
- [x] Linked parent spec remains the source of full feature philosophy
- [x] Delivery evidence will be recorded in the report
