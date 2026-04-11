---
doc_type: brainstorm
id: 260402_1320_repo-sandbox-integrity_brainstorm_01
theme: repo-sandbox-integrity
status: final
roadmap_feature: F-10
parent_spec: 260323_1704_universal-skills-runtime-integration_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260402_1320_repo-sandbox-integrity_plan_01
created_at: '2026-04-02T13:20:08-03:00'
updated_at: '2026-04-02T13:20:08-03:00'
---

# Brainstorm: repo-sandbox-integrity

## Problem Statement
- This scaffold is intended to be the base system that downstream repositories adopt, so its internal runtime surface must behave like a repo-local sandbox rather than a thin wrapper over host state.
- Internal scripts, bootstrap behavior, validation gates, and runtime adapters are close to that goal, but they still leave important dependency, verification, and write-path gaps that make the downstream contract weaker than the repository promises.

## Repo Context to Validate
- Files/areas likely involved:
  - `.agents/agents`
  - `.agents/agents.config`
  - `.agents/a-docs/standards/Makefile`
  - `.agents/scripts/agents-bootstrap.py`
  - `.agents/scripts/agents-skills-sync.py`
  - `.agents/scripts/tests/integration/test_critical_workflows.py`
  - `README.md`
  - `AGENTS.md`
- Existing patterns or constraints to confirm:
  - External tools may remain installation-time inputs, but runtime behavior should be repo-local after setup.
  - The scaffold must stay CLI-interactive-first and secret-free.
  - Bootstrap must still work for both fresh and partial installs.
  - `arc/map/` must remain evidence, not a second governance tree.

## Assumptions
- The parent feature philosophy in `F-10` is broad enough to host a workstream that tightens reproducibility and downstream readiness across skills/bootstrap/runtime surfaces.
- `F-06` runtime-compatibility guarantees and `F-11` current-state-vs-goal-state boundaries remain binding constraints for this work even though they are not the governing feature here.

## Options
1. Option A - Patch only the validation gap (`make all`, test harness, CI) and defer bootstrap/skills contract tightening.
2. Option B - Treat repo-sandbox integrity as a focused F-10 hardening slice that spans validation, bootstrap, skills source semantics, and docs parity.
3. Option C - Create a brand-new roadmap feature and parent spec before any planning work continues.

## Tradeoffs
| Option | Pros | Cons | Risk | Complexity |
|--------|------|------|------|------------|
| A | Smallest immediate change set | Leaves the downstream repo contract partially open | Medium | low |
| B | Aligns the strongest user requirement with the closest planned feature and keeps the work bounded | Requires careful scope control because the work crosses multiple files and promises | Low | medium |
| C | Creates perfect governance alignment for a cross-cutting theme | Adds extra planning bureaucracy before the current repo evidence is converted into an execution plan | Medium | medium |

## Preferred Direction
- Selected: Option B
- Why: The core requirement is deterministic, repo-local adoption of the scaffold in downstream repositories. `F-10` already owns the strongest reproducibility and bootstrap surface, and a `spec-lite` can capture the wider local sandbox contract without reopening product philosophy.
- Rejected options:
  - Option A -> too narrow for the explicit user requirement.
  - Option C -> useful only if the execution slice proves larger than the existing F-10 umbrella.

## Decision Criteria
- A downstream repo can run the scaffold's internal command surface after setup without relying on host-global mutable state.
- Bootstrap outputs remain generic, secret-free, and safe for existing repositories.
- Validation semantics truthfully represent what is and is not being proven.
- Skills/bootstrap inputs that remain external are explicit installation-time dependencies, not hidden runtime dependencies.

## Planning Readiness
- Ready for explorer-check: yes
- Unknowns that must be verified against the current repo:
  - Whether `make all` should become truly hermetic or remain a fast gate with a new stronger gate added beside it.
  - Whether the preferred sibling `../universal-skills` checkout remains acceptable as an installation input or must become optional/fallback only.
  - Whether the work still fits cleanly under `F-10` after the execution slices are finalized.
- Knowledge to reuse before planning:
  - `.agents/a-docs/knowledge/INDEX.md`
  - `260323_1305_wrapper-runtime-isolation-hardening_*`
  - `260323_1407_bootstrap-generic-export_*`
  - `260323_1507_bootstrap-partial-install_*`
  - `260323_1705_universal-skills-runtime-integration_*`
  - `260323_1827_universal-skills-local-source-and-discovery_*`

---
*Template: `.agents/a-docs/templates/brainstorm.md`*
