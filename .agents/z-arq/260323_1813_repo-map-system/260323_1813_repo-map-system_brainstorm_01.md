---
doc_type: brainstorm
id: 260323_1813_repo-map-system_brainstorm_01
theme: repo-map-system
status: final
roadmap_feature: F-11
parent_spec: 260323_1741_current-state-maps-and-goal-state-governance_spec_01
child_spec: 260323_1750_current-state-map-contract_spec_01
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260323_1813_repo-map-system_plan_01
created_at: '2026-03-23T18:13:06-03:00'
updated_at: '2026-03-23T18:30:47-03:00'
---

# Brainstorm: repo-map-system

## Problem Statement
- The scaffold defines `arc/map/` conceptually, but it still lacks a first-class command and operational contract for generating a full repository codemap.
- OpenCode already uses a `repo-organizer` pattern backed by `deep-code-analisys` and `docker-analisys-tools`; this scaffold should absorb the reusable parts without importing OpenCode-specific orchestration semantics.

## Repo Context to Validate
- Files/areas likely involved:
  - `.agents/agents`
  - `.agents/agents.config`
  - `.agents/tools.json`
  - `.agents/a-docs/standards/`
  - `.agents/scripts/`
- Existing patterns or constraints to confirm:
  - `structure-map` already covers lightweight physical layout, so `repo-map` must be clearly positioned as the heavier codemap path.
  - `bootstrap` already provisions `.agents/arc/map/`, so the new command should attach to that surface instead of inventing another output tree.

## Assumptions
- The external runner at `~/apps/docker-analisys-tools/scripts/run-repo-map.sh` is the right execution backend when available.
- The scaffold should wrap that runner, not duplicate the deep-analysis stack internally.

## Options
1. Option A - Keep only the current `arc/map/README.md` contract and document a manual shell command.
2. Option B - Add a scaffold-native `repo-map` command that wraps the external runner, plus docs/tests/config.
3. Option C - Reimplement the OpenCode `repo-organizer` workflow inside this repo as a larger orchestration system.

## Tradeoffs
| Option | Pros | Cons | Risk | Complexity |
|--------|------|------|------|------------|
| A | Small diff | Leaves mapping non-canonical and easy to forget | High operational drift | low |
| B | Gives the scaffold a stable current-state mapping command with minimal duplication | Depends on an external runner/toolbox | Medium | medium |
| C | Maximum parity with OpenCode | Pulls in too much orchestration complexity and duplicates existing `.agents` governance | High | high |

## Preferred Direction
- Selected: Option B
- Why: it imports the useful part of `repo-organizer` into the scaffold as a reproducible command surface without creating a second orchestration layer.
- Rejected options:
  - Option A -> too weak for a "solid" repo-mapping system
  - Option C -> overfits the scaffold to OpenCode agent topology instead of keeping `.agents` canonical

## Decision Criteria
- The mapping workflow must stay inside `.agents/arc/map/`.
- The command must be runnable from this repo without manual shell recipe hunting.
- The solution must preserve roadmap/spec/workbench authority.

## Planning Readiness
- Ready for explorer-check: yes
- Unknowns that must be verified against the current repo:
  - Whether the scaffold already exposes any repo-map command surface
  - Which docs/tests need updating to keep the command canonical
- Knowledge to reuse before planning:
  - `~/.config/opencode/agent/repo-organizer.md`
  - `~/apps/docker-analisys-tools/scripts/run-repo-map.sh`
  - `.agents/a-docs/standards/structure-map.md`
  - `.agents/scripts/README.md`

---
*Template: `.agents/a-docs/templates/brainstorm.md`*
