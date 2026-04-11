---
doc_type: plan
id: 260307_1734_persistent-planning-memory_plan_01
theme: persistent-planning-memory
status: final
owners:
- orchestrator
created_at: '2026-03-07T17:34:00-03:00'
updated_at: '2026-03-07T18:19:40-03:00'
roadmap_feature: F-09
parent_spec: 260307_persistent-planning-memory_spec_01
child_spec: ''
links:
  roadmap: 260223_0000_arc_roadmap_01
  brainstorm: 260307_1734_persistent-planning-memory_brainstorm_01
  explorer_check: 260307_1734_persistent-planning-memory_explorer-check_01
  research: 260307_1734_persistent-planning-memory_research_01
  task: 260307_1734_persistent-planning-memory_task_01
repo: agentic_start_folder
branch: main
---

# Plan: persistent-planning-memory

## Objective
- Define a native improvement track that incorporates the external "planning with files" discipline into the scaffold without creating a second documentation system.

## Scope
- In scope:
  - roadmap and spec definition for persistent planning memory
  - session catchup and resume workflow design
  - mapping between lightweight memory-file concepts and canonical workbench artifacts
  - freshness and safety guardrails for research/log updates
- Out of scope:
  - immediate implementation of new commands in this planning pass
  - root-level canonical `task_plan.md`, `findings.md`, and `progress.md` files

## Governance Context
- Roadmap feature: `F-09`
- Parent spec: `260307_persistent-planning-memory_spec_01`
- Child spec:
  - none yet; implementation may add one if command design and validation design need separation
- Planning rule:
  - Keep `.agents/wb/` canonical and treat the external pattern as a mental model, not a competing storage layout.

## Planning Inputs
- Brainstorm artifact: `260307_1734_persistent-planning-memory_brainstorm_01`
- Explorer check artifact: `260307_1734_persistent-planning-memory_explorer-check_01`
- Research artifact: `260307_1734_persistent-planning-memory_research_01`
- Knowledge lookup performed:
  - attempted via `.agents/agents knowledge pull planning`, but wrapper execution is currently blocked in this sandbox by dependency/network resolution through `uv`
  - compensated by direct inspection of roadmap/spec/scripts/templates relevant to planning, knowledge, and status

## Success Criteria
- A roadmap feature and governing spec define the new capability in system-native terms.
- The plan identifies a minimal implementation sequence with low blast radius.
- The plan makes the security boundary explicit: external content goes to `research`, not `plan`.
- Reviewers can tell how the external three-file model maps onto the current workbench system.

## Delivery Strategy
1. Define the feature contract.
2. Design the catchup/resume flow and working-memory mapping.
3. Add validation and runtime-surface changes with conservative heuristics.
4. Update operator docs and templates after command behavior is settled.

## Phase Breakdown
1. Phase 1: Product framing
   - finalize roadmap entry, parent spec, and workstream docs
2. Phase 2: Command design
   - decide whether catchup belongs under `session`, `status`, or a new command
   - define catchup output contract and stale-artifact heuristics
3. Phase 3: Guardrails
   - extend `review`/`verify`/`status` with freshness signals for major sessions
   - define safe handling of external content
4. Phase 4: Documentation rollout
   - update README, standards, and runtime mirrors with the new workflow

## Critical Dependencies
- Tools:
  - `agents-status.py`
  - `agents-review.py`
  - `verify-tasks.py`
  - `agents-knowledge.py`
- MCPs:
  - none
- Skills:
  - `agentic-system-workflow`
- Executor instruction:
  - reuse existing artifact resolution and knowledge surfaces before adding any new storage abstraction

## Large Plan Handling
- Current size is below the split threshold.
- If command semantics and validation semantics diverge materially, create child specs before implementation.

## Risks and Mitigations
- Risk: duplicate planning systems confuse operators -> Mitigation: document strict canonical mapping and reject new root source-of-truth files.
- Risk: freshness checks become noisy -> Mitigation: start with warnings in `status`/`review`, promote only proven rules to strict verification.
- Risk: resume command duplicates existing status behavior -> Mitigation: build catchup as a thin extension over artifact resolution and task summary logic.

## Verification Plan
- Unit: targeted tests for catchup resolution and stale-artifact heuristics
- E2E: session fixture proving git drift and workbench drift are surfaced coherently
- Typecheck: N/A
- Lint: `make lint`
- Other checks:
  - manual design review against F-07 and F-08 boundaries
  - confirm no new canonical storage tree was introduced

## Completion Gate
- [x] Brainstorm exists and reflects real option analysis
- [x] Explorer check proves current-project inspection happened
- [x] Relevant prior knowledge was searched or explicitly ruled out
- [x] Verification path is concrete enough to execute without guesswork

---
*Template base: `.agents/a-docs/templates/plan.md`*
