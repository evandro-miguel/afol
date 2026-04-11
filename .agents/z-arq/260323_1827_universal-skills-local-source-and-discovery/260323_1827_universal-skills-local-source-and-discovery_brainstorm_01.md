---
doc_type: brainstorm
id: 260323_1827_universal-skills-local-source-and-discovery_brainstorm_01
theme: universal-skills-local-source-and-discovery
status: final
roadmap_feature: F-10
parent_spec: 260323_1704_universal-skills-runtime-integration_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260323_1827_universal-skills-local-source-and-discovery_plan_01
created_at: '2026-03-23T18:27:53-03:00'
updated_at: '2026-03-23T19:07:53-03:00'
---

# Brainstorm: universal-skills-local-source-and-discovery

## Problem Statement
- The scaffold already resolves and installs skills from a universal-skills manifest, but the operator UX is incomplete for interactive agents because there is no native discovery flow (`list/search/ensure`).
- The current source-of-truth clone also lives inside `.agents/cache/`, while the user wants the upstream source repo managed as a sibling checkout under `/home/ozy/apps/universal-skills` instead of relying on global Codex skills or a repo-local cache clone.

## Repo Context to Validate
- Files/areas likely involved:
  - `.agents/scripts/agents-skills-sync.py`
  - `.agents/scripts/tests/test_agents_skills_sync.py`
  - `.agents/agents.config`
  - `.agents/skills-sync.manifest.json`
  - `.agents/a-docs/agentic/agents-skills-sync.md`
  - `.agents/a-docs/standards/skills-sync.md`
- Existing patterns or constraints to confirm:
  - `F-10` already governs the universal-skills integration contract.
  - The scaffold is CLI-interactive-first and should not depend on Codex global skills for project behavior.
  - Repo artifacts must remain in English.

## Assumptions
- A sibling checkout at `../universal-skills` is acceptable as the preferred local source for this repo and other repos bootstrapped nearby.
- The global Codex skills directory may still contain content copied from universal-skills, but the scaffold should not require it.

## Options
1. Option A - Keep `.agents/cache/universal-skills` as the only source and only add discovery commands.
2. Option B - Prefer a sibling local source repo checkout (`../universal-skills`), keep cache path as compatibility fallback, and add discovery commands.
3. Option C - Remove scaffold-managed source resolution and expect agents to use global Codex skills directly.

## Tradeoffs
| Option | Pros | Cons | Risk | Complexity |
|--------|------|------|------|------------|
| A | Smallest code diff | Keeps source hidden inside repo cache; does not satisfy the requested local source layout | medium | low |
| B | Matches requested operator workflow, removes dependence on global skills, preserves backward compatibility | Requires config, docs, tests, and source selection logic changes | low | medium |
| C | Minimal scaffold logic | Pushes behavior outside the repo contract and breaks reproducibility | high | low |

## Preferred Direction
- Selected: Option B
- Why: It keeps the scaffold reproducible and CLI-friendly while honoring the requested sibling checkout model and adding the missing discovery/install UX agents need.
- Rejected options:
  - Option A -> still leaves the main source path in the wrong place for the requested workflow.
  - Option C -> would regress the scaffold into relying on machine-global state.

## Decision Criteria
- Agents can discover upstream skills from the project itself.
- The scaffold no longer depends on global Codex skills for universal-skills content.
- Existing repos with the older cache clone do not break immediately.

## Planning Readiness
- Ready for explorer-check: yes
- Unknowns that must be verified against the current repo:
  - Whether tests assume `.agents/cache/universal-skills` as the only source path.
  - Whether the global Codex skills directory contains universal-skills payload that should be archived rather than deleted outright.
- Knowledge to reuse before planning:
  - `./.agents/agents knowledge search "universal skills integration local clone search ensure"` -> no direct match.
  - Existing `F-10` roadmap/spec/workbench artifacts.

---
*Template: `.agents/a-docs/templates/brainstorm.md`*
