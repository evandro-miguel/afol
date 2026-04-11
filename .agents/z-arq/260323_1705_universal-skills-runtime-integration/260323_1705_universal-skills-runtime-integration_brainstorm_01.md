---
doc_type: brainstorm
id: 260323_1705_universal-skills-runtime-integration_brainstorm_01
theme: universal-skills-runtime-integration
status: final
roadmap_feature: F-10
parent_spec: 260323_1704_universal-skills-runtime-integration_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260323_1705_universal-skills-runtime-integration_plan_01
created_at: '2026-03-23T17:05:28-03:00'
updated_at: '2026-03-23T17:25:44-03:00'
---

# Brainstorm: universal-skills-runtime-integration

## Problem Statement
- The scaffold's current `skills-sync` is a shallow copy/link mechanism, while the upstream universal-skills model already supports pinned source refs, profiles, host-aware installs, and stronger diagnostics.
- This repo should absorb the useful parts of that model without turning the scaffold into the universal-skills source repo itself.

## Repo Context to Validate
- Files/areas likely involved:
  - `.agents/scripts/agents-skills-sync.py`
  - `.agents/scripts/agents-bootstrap.py`
  - `.agents/agents.config`
  - `.agents/skills-sync.manifest.json`
  - `.agents/cache/universal-skills/README.md`
- Existing patterns or constraints to confirm:
  - The scaffold is optimized for interactive CLI runtimes, not backend SDK embedding.
  - Bootstrap must keep working for fresh and partial installs.
  - Existing simple skills-sync users need a migration path.

## Assumptions
- The universal-skills repo should remain the upstream source of skill content and install semantics.
- This scaffold should wrap that model in project-local governance, bootstrap, and runtime-friendly commands.

## Options
1. Option A - Keep the current simple manifest and only document universal-skills as an optional advanced path.
2. Option B - Evolve scaffold `skills-sync` into a thin adapter over the universal-skills lock/profile model.
3. Option C - Remove scaffold-native skills-sync and depend directly on upstream scripts.

## Tradeoffs
| Option | Pros | Cons | Risk | Complexity |
|--------|------|------|------|------------|
| A | Low change, minimal migration work | Leaves scaffold behind the stronger upstream contract | Medium | low |
| B | Keeps scaffold UX canonical while gaining reproducibility and multi-host semantics | Requires migration work and command redesign | Low | medium |
| C | Maximum reuse of upstream implementation | Loses scaffold-local UX, governance integration, and bootstrap control | High | medium |

## Preferred Direction
- Selected: Option B
- Why: The scaffold should remain the operator-facing layer, but it should stop inventing a weaker local skills contract when the upstream model is already better.
- Rejected options:
  - Option A -> avoids immediate work but preserves the wrong abstraction.
  - Option C -> gives up too much control over bootstrap, docs, and runtime ergonomics.

## Decision Criteria
- Reproducible skill installs across interactive runtimes.
- Bootstrap-ready project experience for both fresh and partial installs.
- Minimal duplication of upstream universal-skills logic.
- Clear migration path from the current simple manifest.

## Planning Readiness
- Ready for explorer-check: yes
- Unknowns that must be verified against the current repo:
  - Which exact upstream lockfile fields should land in the first scaffold migration.
  - Whether bootstrap should create a lockfile or a scaffold-specific compatibility manifest.
- Knowledge to reuse before planning:
  - `./.agents/agents knowledge pull "skills sync bootstrap runtime compatibility"` and current bootstrap/runtime hardening sessions.

---
*Template: `.agents/a-docs/templates/brainstorm.md`*
