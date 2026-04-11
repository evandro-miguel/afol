---
doc_type: brainstorm
id: 260402_1505_skills-sync-git-publish_brainstorm_01
theme: skills-sync-git-publish
status: final
roadmap_feature: F-10
parent_spec: 260323_1704_universal-skills-runtime-integration_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260402_1505_skills-sync-git-publish_plan_01
created_at: '2026-04-02T15:05:32-03:00'
updated_at: '2026-04-02T15:21:55-03:00'
---

# Brainstorm: skills-sync-git-publish

## Problem Statement
- Downstream repos bootstrapped with a repo-local seed can work offline, but they
  still need a simple path to refresh selected skills from git when needed.
- The scaffold also lacked a first-class way to publish a locally edited skill
  back to the universal-skills git source.

## Repo Context to Validate
- Files/areas likely involved:
  - `.agents/scripts/agents-skills-sync.py`
  - `.agents/a-docs/standards/Makefile`
  - `README.md`
  - `.agents/tools.json`
- Existing patterns or constraints to confirm:
  - Bootstrap must remain self-contained and local-first by default.
  - Existing `pull`, `apply`, and `sync` semantics should avoid unnecessary breaking changes.
  - Publish to remote must stay explicit and opt-in.

## Assumptions
- `.agents/source/universal-skills` remains the preferred local source surface.
- `.agents/cache/universal-skills` can act as a git-backed mirror when the local
  source is only a seed copy.

## Options
1. Option A - Reinterpret `pull` to refresh and install skills directly.
2. Option B - Keep `pull` as source refresh, make `sync/update` the one-step installer, and add `push`.
3. Option C - Add only `push` and leave downstream git refresh behavior unchanged for seeded repos.

## Tradeoffs
| Option | Pros | Cons | Risk | Complexity |
|--------|------|------|------|------------|
| A | Single verb for users | Breaks current semantics and docs around `pull` | medium | medium |
| B | Preserves compatibility, adds clear publish path, fixes seeded-repo refresh via mirror | Slightly larger implementation surface | low | medium |
| C | Smallest diff | Leaves the seeded downstream refresh gap unsolved | medium | low |

## Preferred Direction
- Selected: `Option B`
- Why: it preserves the current contract shape while making the real update path
  simple and adding the missing publish primitive.
- Rejected options:
  - `Option A` -> too much semantic break for `pull`.
  - `Option C` -> does not solve the actual git-refresh workflow for downstream repos.

## Decision Criteria
- `make all` must stay green.
- Seeded downstream repos must be able to refresh selected skills from git.
- Remote publication must remain explicit.

## Planning Readiness
- Ready for explorer-check: yes
- Unknowns that must be verified against the current repo:
  - Whether `sync` already covers the intended simple update behavior.
  - Which docs/tables/catalog entries define the canonical contract today.
- Knowledge to reuse before planning:
  - Existing sandbox-integrity work already established the local-first bootstrap baseline.
