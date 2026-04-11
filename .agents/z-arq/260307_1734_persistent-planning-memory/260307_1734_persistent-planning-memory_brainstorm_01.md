---
doc_type: brainstorm
id: 260307_1734_persistent-planning-memory_brainstorm_01
theme: persistent-planning-memory
status: active
roadmap_feature: F-09
parent_spec: 260307_persistent-planning-memory_spec_01
child_spec: ''
links:
  roadmap: 260223_0000_arc_roadmap_01
  plan: 260307_1734_persistent-planning-memory_plan_01
created_at: '2026-03-07T17:34:00-03:00'
updated_at: '2026-03-07T18:19:40-03:00'
---

# Brainstorm: persistent-planning-memory

## Problem Statement
- The system has durable workbench artifacts but lacks a simple, native workflow for high-frequency note capture and session resume.

## Repo Context to Validate
- Files/areas likely involved:
  - `.agents/arc/GENERAL-ROADMAP.md`
  - `.agents/arc/SPECS/`
  - `.agents/scripts/agents-status.py`
  - `.agents/scripts/agents-knowledge.py`
  - `.agents/scripts/verify-tasks.py`
  - `.agents/a-docs/templates/`
- Existing patterns or constraints to confirm:
  - `.agents/wb/` must remain canonical.
  - Major plans already require brainstorm and explorer-check artifacts.
  - External content should not be treated as trusted plan input.

## Assumptions
- The repo already has the right artifact family; the gap is operator ergonomics and synchronization discipline.
- A native catchup flow is more valuable than introducing a second set of root markdown files.

## Options
1. Option A - Add root `task_plan.md`, `findings.md`, and `progress.md` files alongside the workbench.
2. Option B - Map the three-file model onto `plan`/`research`/`log` and add catchup/freshness tooling.
3. Option C - Keep current docs and only update README guidance.

## Tradeoffs
| Option | Pros | Cons | Risk | Complexity |
|--------|------|------|------|------------|
| A | Familiar to users of the pattern | Creates a second source of truth | High | Medium |
| B | Preserves governance and improves usability | Needs careful docs and validation design | Medium | Medium |
| C | Smallest immediate change | Does not solve resume drift or note-capture gaps | High | Low |

## Preferred Direction
- Selected: Option B
- Why: It preserves the current workbench model while absorbing the best parts of the pattern: durable notes, explicit catchup, and decision hygiene.
- Rejected options:
  - Option A -> duplicates canonical state and invites drift.
  - Option C -> leaves the main workflow gap unresolved.

## Decision Criteria
- No duplicate source of truth.
- Stronger resume safety before execution continues.
- Clear mapping for operators who prefer the three-file mental model.
- Low enough overhead for adoption across runtimes.

## Planning Readiness
- Ready for explorer-check: yes
- Unknowns that must be verified against the current repo:
  - Which existing commands already expose enough session context to power catchup.
  - Whether current verify/review flows can absorb freshness checks cleanly.
- Knowledge to reuse before planning:
  - Existing execution-intelligence and guided-status specs
  - `agents-status.py`
  - `agents-knowledge.py`

---
*Template base: `.agents/a-docs/templates/brainstorm.md`*
