---
doc_type: brainstorm
id: 260323_1407_bootstrap-generic-export_brainstorm_01
theme: bootstrap-generic-export
status: final
roadmap_feature: F-04
parent_spec: 260306_roadmap-first-delivery-system_spec_01
child_spec: ''
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260323_1407_bootstrap-generic-export_plan_01
created_at: '2026-03-23T14:07:57-03:00'
updated_at: '2026-03-23T14:18:47-03:00'
---

# Brainstorm: bootstrap-generic-export

## Problem Statement
- `agents-bootstrap.py` copied scaffold-local governance state into downstream repos.
- Bootstrapped targets inherited knowledge indexes, lesson history, telemetry reports, and the scaffold's live roadmap/spec backlog instead of starting from a generic baseline.

## Repo Context to Validate
- Files/areas likely involved:
  - `.agents/scripts/agents-bootstrap.py`
  - `.agents/scripts/tests/test_runtime_compatibility.py`
- Existing patterns or constraints to confirm:
  - Bootstrap must still pass `doctor`, `lint`, `test-scripts`, and `all` in a fresh target repo.
  - Roadmap-first governance cannot be broken by the generated baseline.

## Assumptions
- A downstream repo should start with empty or placeholder governance state, not this repository's operational history.
- Reusable tooling/docs can still be copied as long as generated or history-bearing artifacts are sanitized.

## Options
1. Option A - Keep copying the current tree and rely on users to clean the target repo manually.
2. Option B - Copy only reusable assets and generate a generic baseline for roadmap/spec/index state.
3. Option C - Stop bootstrapping most docs and require manual project setup after install.

## Tradeoffs
| Option | Pros | Cons | Risk | Complexity |
|--------|------|------|------|------------|
| A | Small code change | Leaks scaffold history, error-prone hand cleanup | High | low |
| B | Clean target repo, deterministic, testable | Requires explicit baseline generation logic | Low | medium |
| C | No history leakage | Weak onboarding, more manual setup, easier to misconfigure | Medium | medium |

## Preferred Direction
- Selected: Option B
- Why: It preserves the scaffold's automation value while guaranteeing exported repos start from project-generic governance state.
- Rejected options:
  - Option A -> pushes critical cleanup onto users and makes bootstrap output misleading by default.
  - Option C -> removes too much of the scaffold's value and weakens downstream consistency.

## Decision Criteria
- A fresh bootstrap target must pass its own post-checks without manual edits.
- The target repo must not contain scaffold-local workbench, knowledge, lessons, telemetry reports, or live specs/backlog.

## Planning Readiness
- Ready for explorer-check: yes
- Unknowns that must be verified against the current repo:
  - Which copied paths currently leak scaffold-local state.
  - Which generated baseline files are required for `doctor` to accept a fresh target repo.
- Knowledge to reuse before planning:
  - `./.agents/agents knowledge pull "bootstrap export generic scaffold"` -> no reusable knowledge found.

---
*Template: `.agents/a-docs/templates/brainstorm.md`*
