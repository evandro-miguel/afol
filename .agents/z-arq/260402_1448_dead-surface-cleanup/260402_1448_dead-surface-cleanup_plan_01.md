---
doc_type: plan
id: 260402_1448_dead-surface-cleanup_plan_01
theme: dead-surface-cleanup
status: final
owners:
- orchestrator
created_at: 2026-04-02 14:48:32-03:00
updated_at: '2026-04-02T15:01:21-03:00'
roadmap_feature: F-11
parent_spec: 260323_1741_current-state-maps-and-goal-state-governance_spec_01
child_spec: null
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  brainstorm: 260402_1448_dead-surface-cleanup_brainstorm_01
  explorer_check: 260402_1448_dead-surface-cleanup_explorer-check_01
  research: 260402_1448_dead-surface-cleanup_research_01
  task: 260402_1448_dead-surface-cleanup_task_01
repo: agentic_start_folder
branch: feat/scaffold-runtime-governance-hardening
---

# Plan: dead-surface-cleanup

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current as work proceeds. Follow `PLANS.md` from the repository root when writing or revising this file.

## Purpose / Big Picture
- Keep the scaffold lean by removing tracked dead surfaces and stale placeholder
  docs that no longer describe the real system.
- A user can verify the result by seeing `make all` pass while the repository no
  longer contains the removed migration/test placeholder assets.

## Progress
- [x] 2026-04-02 14:48-03:00 - Mapped cleanup candidates with local search and two supporting subagents.
- [x] 2026-04-02 14:55-03:00 - Removed high-confidence dead files and updated test documentation.
- [x] 2026-04-02 14:58-03:00 - Regenerated structure docs so generated inventories match the current tree.
- [x] 2026-04-02 14:59-03:00 - Passed `make all` after cleanup.

## Surprises & Discoveries
- Observation: generated structure docs were still advertising deleted files even after the code cleanup.
  Evidence: `rg -n "migrate-task-board.py|test_data/scenarios.yaml|tests/e2e/__init__" .agents/arc/structure`
- Observation: compatibility-cache candidates existed, but their risk was materially higher than the local scaffold leftovers.
  Evidence: subagent review found only medium-confidence proof for cache cleanup.

## Decision Log
- Decision: remove only high-confidence dead surfaces in this pass.
  Rationale: preserve compatibility while still cutting obvious dead weight.
  Date/Author: 2026-04-02 / Codex
- Decision: keep `TEST_STRATEGY.md` but replace speculative content with the real current suite.
  Rationale: the file is useful only if it stays factual.
  Date/Author: 2026-04-02 / Codex

## Outcomes & Retrospective
- Outcome: dead placeholders were removed and generated docs were refreshed.
- Remaining: a separate compatibility-cache audit can decide whether more legacy content can be retired.
- Lesson: when removing dead files, refresh generated inventories in the same change so docs do not keep ghost entries.

## Governance Context
- Roadmap feature: `F-11`
- Parent spec: `260323_1741_current-state-maps-and-goal-state-governance_spec_01`
- Child spec: ``
- Planning rule:
  - Do not redefine feature philosophy here; use this file to plan execution of already-defined intent.
  - A major plan is not complete until brainstorm and explorer-check artifacts exist and are linked here.

## Planning Inputs
- Brainstorm artifact: `260402_1448_dead-surface-cleanup_brainstorm_01`
- Explorer check artifact: `260402_1448_dead-surface-cleanup_explorer-check_01`
- Research artifact: `260402_1448_dead-surface-cleanup_research_01`
- Knowledge lookup performed:
  - Reused the earlier sandbox-integrity work as context for the self-contained bootstrap contract.

## Context and Orientation
- The scaffold is a terminal-first `.agents` baseline that carries runtime
  wrappers, workbench governance, and local skills into downstream repositories.
- The cleanup targets are local repository assets, not external tools or
  optional compatibility sources.
- Generated structure docs under `.agents/arc/structure/` are expected to
  mirror the current repository tree.

## Scope
- In scope:
  - Delete tracked dead files with no live operational consumer.
  - Remove stale placeholder test surfaces and align `TEST_STRATEGY.md`.
  - Refresh generated structure docs after deletion.
- Out of scope:
  - Broad removal inside `.agents/cache/universal-skills`.
  - Changes to the bootstrap self-contained contract already delivered earlier.

## Plan of Work
- Confirm non-use with `rg` and subagent review.
- Remove only dead tracked surfaces from `.agents/scripts/` and `.agents/scripts/tests/`.
- Simplify `.agents/scripts/tests/TEST_STRATEGY.md` to the real suite.
- Regenerate `.agents/arc/structure/` so generated docs stop listing deleted files.
- Revalidate with the standard repo gate.

## Concrete Steps
1. Delete `.agents/scripts/migrate-task-board.py`, `.agents/scripts/tests/e2e/__init__.py`, `.agents/scripts/tests/test_data/scenarios.yaml`, and `.coverage`.
2. Remove the unused bootstrap source-contract loader from `.agents/scripts/agents-bootstrap.py`.
3. Rewrite `.agents/scripts/tests/TEST_STRATEGY.md` and refresh nearby descriptions.
4. Run `uv run --project .agents/scripts python .agents/scripts/agents-structure-map.py . --output .agents/arc/structure/`.
5. Run `make all`.

## Interfaces and Dependencies
- Tools:
  - `rg`
  - `uv`
  - `make`
- MCPs:
  - none
- Skills:
  - `refactor-simplification`
  - `workbench-agent-teams`
- Files and interfaces that must exist at the end:
  - `.agents/scripts/agents-bootstrap.py` with only live bootstrap helpers
  - `.agents/scripts/tests/TEST_STRATEGY.md` aligned to the actual suite
  - `.agents/arc/structure/` without ghost references to deleted files

## Risks and Mitigations
- Risk: deleting compatibility assets by mistake -> Mitigation: leave medium-risk cache content out of scope.
- Risk: generated docs drift after deletion -> Mitigation: regenerate structure docs in the same pass.

## Validation and Acceptance
- Unit: `make all`
- E2E: `N/A`
- Typecheck: `N/A`
- Lint: `make all`
- Behavioral acceptance:
  - `make all` passes after the cleanup.
  - Local search no longer finds live references to the removed files outside historical lessons.

## Idempotence and Recovery
- The structure-map regeneration and `make all` are safe to re-run.
- If generated docs drift again, re-run the structure map before final verification.

## Artifacts and Notes
- Search proof:
  - `rg -n "migrate-task-board|scenarios\.yaml|tests/e2e/__init__" . README.md AGENTS.md .agents`
- Validation proof:
  - `make all`

## Completion Gate
- [x] Brainstorm exists and reflects real option analysis
- [x] Explorer check proves current-project inspection happened
- [x] Relevant prior knowledge was searched or explicitly ruled out
- [x] The ExecPlan remains self-contained enough for a new contributor to resume
- [x] Progress entries reflect the actual current state
- [x] Validation path is concrete enough to execute without guesswork

---
*Template: `.agents/a-docs/templates/plan.md`*
