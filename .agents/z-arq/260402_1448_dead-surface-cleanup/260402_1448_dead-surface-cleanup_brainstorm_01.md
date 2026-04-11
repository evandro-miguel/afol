---
doc_type: brainstorm
id: 260402_1448_dead-surface-cleanup_brainstorm_01
theme: dead-surface-cleanup
status: final
roadmap_feature: F-11
parent_spec: 260323_1741_current-state-maps-and-goal-state-governance_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260402_1448_dead-surface-cleanup_plan_01
created_at: '2026-04-02T14:48:32-03:00'
updated_at: '2026-04-02T15:01:21-03:00'
---

# Brainstorm: dead-surface-cleanup

## Problem Statement
- Remove stale or dead surfaces from the scaffold without breaking the
  self-contained runtime contract.
- Prefer deleting only assets that have no live operational consumer in the
  current repository.

## Repo Context to Validate
- Files/areas likely involved:
  - `.agents/scripts/agents-bootstrap.py`
  - `.agents/scripts/tests/`
  - `README.md`
  - `.agents/arc/structure/`
- Existing patterns or constraints to confirm:
  - Generated docs should match the current repository tree.
  - Historical lessons can mention removed files without keeping them alive.
  - Compatibility cache content is higher risk than local scaffold surfaces.

## Assumptions
- A file is a safe cleanup target only when local search shows no live consumer
  in wrapper commands, Make targets, tests, or canonical docs.
- Medium-risk compatibility assets should stay unless removal is proven safe.

## Options
1. Option A - Remove only high-confidence dead surfaces and refresh generated docs.
2. Option B - Purge all suspicious legacy assets, including compatibility cache content.
3. Option C - Keep everything and accept documentation drift and dead tracked files.

## Tradeoffs
| Option | Pros | Cons | Risk | Complexity |
|--------|------|------|------|------------|
| A | Small blast radius, easy to verify, keeps compatibility paths intact | Leaves some medium-risk legacy surfaces for later review | low | low |
| B | Maximizes cleanup | Higher chance of breaking fallback or downstream expectations | medium/high | medium |
| C | No change risk | Keeps dead files and stale docs in the scaffold | medium | low |

## Preferred Direction
- Selected: `Option A`
- Why: it removes clearly dead assets, aligns generated docs, and preserves the
  compatibility contract that still has operational value.
- Rejected options:
  - `Option B` -> not enough proof for cache-level compatibility removals.
  - `Option C` -> leaves known dead tracked surfaces in place.

## Decision Criteria
- Local proof of non-use in the active repository.
- No regression in `make all`.
- Generated structure docs must stop advertising deleted files.

## Planning Readiness
- Ready for explorer-check: yes
- Unknowns that must be verified against the current repo:
  - Whether any generated structure docs or test docs still reference deleted assets.
- Knowledge to reuse before planning:
  - Previous sandbox-integrity work already established the self-contained
    bootstrap baseline; this cleanup should preserve that contract.

---
*Template: `.agents/a-docs/templates/brainstorm.md`*
