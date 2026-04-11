---
doc_type: brainstorm
id: 260306_2128_context-driven-execution-commands_brainstorm_01
theme: context-driven-execution-commands
status: final
roadmap_feature: F-08
parent_spec: 260306_context-driven-execution-commands_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260306_2128_context-driven-execution-commands_plan_01
created_at: '2026-03-06T21:28:26-03:00'
updated_at: '2026-03-06T22:34:26-03:00'
---

# Brainstorm: context-driven-execution-commands

## Problem Statement
- The scaffold has strong governance and knowledge systems, but operators still need to manually compose low-level commands and locate the right artifacts themselves.
- We need to absorb the best operational ideas from Conductor without duplicating its `conductor/tracks/` structure or weakening the existing roadmap-first model.

## Repo Context to Validate
- Files/areas likely involved:
  - `.agents/agents`
  - `.agents/agents.config`
  - `.agents/scripts/agents-new.py`
  - `.agents/scripts/agents-wb-update.py`
  - `.agents/scripts/agents-knowledge.py`
  - `.agents/arc/GENERAL-ROADMAP.md`
  - runtime mirrors such as `GEMINI.md`
- Existing patterns or constraints to confirm:
  - runtime parity must remain adapter-thin
  - workbench artifacts remain the durable execution state
  - metadata updates must stay automation-driven

## Assumptions
- The right adoption model is selective reuse of Conductor ideas, not a structural port.
- A command-oriented execution layer can sit on top of current roadmap/spec/workbench governance.
- Git can support logical revert, but it should not become the only source of truth.

## Options
1. Option A - Port Conductor nearly as-is, including track-centric structure and command contracts.
2. Option B - Reuse only the strongest UX ideas and map them onto `.agents/arc` plus `.agents/wb`.
3. Option C - Limit the adoption to runtime-specific wrappers and prompts without new canonical scripts.

## Tradeoffs
| Option | Pros | Cons | Risk | Complexity |
|--------|------|------|------|------------|
| A | Fastest path to similar UX | Creates a second governance tree and duplicates state | High | High |
| B | Preserves current architecture while improving operator UX | Requires more design work up front | Low | Medium |
| C | Lowest implementation cost | Fails to improve canonical system behavior | Medium | Low |

## Preferred Direction
- Selected: Option B
- Why: It captures the main value of Conductor, especially artifact resolution and guided command flows, while keeping `.agents` canonical and avoiding a duplicate track system.
- Rejected options:
  - Option A -> rejected because it would compete with roadmap/spec/workbench governance.
  - Option C -> rejected because it pushes behavior into adapters instead of strengthening the canonical system.

## Decision Criteria
- Preserve roadmap-first governance and workbench authority.
- Improve operator UX for setup, status, implement, review, and revert.
- Reuse existing telemetry, knowledge, and runtime compatibility work.
- Keep the command model portable across primary runtimes.

## Planning Readiness
- Ready for explorer-check: yes
- Unknowns that must be verified against the current repo:
  - which existing scripts already cover parts of the desired flows
  - which Conductor capabilities depend too strongly on its track tree or git workflow
- Knowledge to reuse before planning:
  - `.agents/agents knowledge pull runtime`
  - prior F-06 runtime compatibility artifacts
