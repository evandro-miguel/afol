---
doc_type: plan
id: 260223_1855_task-id-standardization_plan_01
theme: task-id-standardization
status: final
owners:
- orchestrator
created_at: '2026-02-23T15:55:42-03:00'
updated_at: '2026-02-23T18:25:49-03:00'
repo: agentic_start_folder
branch: main
links:
  spec: 260223_1855_task-id-standardization_spec-lite_01
  task: 260223_1855_task-id-standardization_task_01
---

# Plan: task-id-standardization

## Objective
- Standardize checklist task IDs (`T-01`/`T-001`) and make verification scripts report exact open tasks with file and line.

## Scope
- In scope:
  - Update `verify-tasks.py` parser to accept only ID-based task lines.
  - Include open-task report with ID, file, line, and status.
  - Update templates/docs to formalize ID format.
- Out of scope:
  - Bulk migration of all historical workbench tasks.

## Success Criteria
- `make verify` output includes open tasks with precise location and IDs.
- `task.md` template documents ID format.
- `make lint` and `make verify` pass.

## Delivery Strategy
1. Update parser and reporting in `verify-tasks.py`.
2. Update template and usage docs.
3. Validate and document evidence.

## Critical Dependencies
- Tools:
  - `make`
- MCPs:
  - None
- Skills:
  - None
- Executor instruction:
  - Keep compatibility with both `T-01` and `T-001`.

## Large Plan Handling
- If this plan exceeds 500 lines, split into phases.
- Create one task file per phase.

## Risks and Mitigations
- Risk: tasks without IDs no longer counted -> Mitigation: document required format in template and standards.

## Verification Plan
- Unit: `N/A`
- E2E: `N/A`
- Typecheck: `python3 -m py_compile .agents/scripts/verify-tasks.py`
- Lint: `make lint`
- Other checks:
  - `make verify`
  - `make all`

---
*Template: `.agents/a-docs/templates/plan.md`*
