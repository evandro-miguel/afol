---
doc_type: spec-child
id: 260415_2121_scripts-cleanup-optimization_spec-child_01
theme: scripts-cleanup-optimization
status: final
owners:
- orchestrator
created_at: '2026-04-15T21:21:55-03:00'
updated_at: '2026-05-28T16:24:04-03:00'
roadmap_feature: F-15
spec_role: child
parent_spec: 260412_2004_repo-wide-simplification-runtime-parity_spec_01
links:
  roadmap: docs/arc/GENERAL-ROADMAP.md
  parent: docs/arc/SPECS/260412_2004_repo-wide-simplification-runtime-parity_spec_01.md
  plan: .agents/wb/260528_1606_scripts-cleanup-optimization/260528_1606_scripts-cleanup-optimization_plan_01.md
  task: .agents/wb/260528_1606_scripts-cleanup-optimization/260528_1606_scripts-cleanup-optimization_task_01.md
---

# SPEC-CHILD: scripts-cleanup-optimization

## Goal

- Land one bounded F-15 cleanup/optimization slice that improves real script
  maintainability and performance without changing the public CLI contract.

## Scope

- Optimize `.agents/scripts/agents-structure-map.py` scan-path file handling.
- Simplify `.agents/scripts/verify-tasks.py` by extracting the strict-mode
  helper flow from `verify_session()`.
- Update focused tests and shipped template mirrors where required.

## Non-Goals

- Broad repo-wide rewrites across every script.
- Changing command flags, output contracts, or governance semantics.

## Acceptance

- Focused tests pass for the touched paths.
- `ruff` passes for `.agents/scripts`.
- `just all` passes after the changes.
- Strict verification passes for the workstream session.
