---
doc_type: brainstorm
id: 260402_1858_project-docs-root-migration_brainstorm_01
theme: project-docs-root-migration
status: final
roadmap_feature: F-11
parent_spec: 260323_1741_current-state-maps-and-goal-state-governance_spec_01
child_spec: ''
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  plan: 260402_1858_project-docs-root-migration_plan_01
created_at: '2026-04-02T18:58:13-03:00'
updated_at: '2026-04-02T20:36:36-03:00'
---

# Brainstorm: project-docs-root-migration

## Problem Statement
- The scaffold still mixed project-owned docs with agent runtime state under `.agents/`, which made downstream bootstrap semantics blurry and left multiple legacy path contracts active.

## Repo Context to Validate
- Files/areas likely involved:
  - `.agents/agents.config`
  - `.agents/scripts/`
  - `docs/`
- Existing patterns or constraints to confirm:
  - project docs should live outside `.agents/`
  - bootstrap must not export local workbench/history

## Assumptions
- `docs/map/` should remain the current-state evidence surface.
- The rest of the project canon can move to `docs/` without changing workbench semantics.

## Options
1. Keep only `docs/map/` in root and leave the rest in `.agents/`.
2. Move the entire project-facing canon to `docs/` and keep `.agents/` runtime-only.
3. Create a parallel compatibility layer and postpone the real migration.

## Tradeoffs
| Option | Pros | Cons | Risk | Complexity |
|--------|------|------|------|------------|
| 1 | smaller diff | leaves mixed ownership model in place | medium | medium |
| 2 | clean ownership boundary, simpler bootstrap story | broad path migration | medium | high |
| 3 | lower immediate risk | preserves long-term confusion and drift | high | medium |

## Preferred Direction
- Selected: option 2
- Why: the user requirement is explicit that project docs belong to the project, not to the agent runtime.
- Rejected options:
  - option 1 -> too partial; keeps the mixed model alive
  - option 3 -> adds compatibility complexity without solving the ownership problem

## Decision Criteria
- downstream bootstrap should stay self-contained and reproducible
- `.agents/` should only carry agent-system concerns

## Planning Readiness
- Ready for explorer-check: yes
- Unknowns that must be verified against the current repo:
  - all runtime/test/bootstrap consumers that still hardcode legacy paths
- Knowledge to reuse before planning:
  - previous docs-map migration sessions in `.agents/wb/`

---
*Template: `docs/templates/brainstorm.md`*
