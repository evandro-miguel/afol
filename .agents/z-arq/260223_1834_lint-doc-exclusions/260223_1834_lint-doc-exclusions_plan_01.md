---
doc_type: plan
id: 260223_1834_lint-doc-exclusions_plan_01
theme: lint-doc-exclusions
status: final
owners:
- orchestrator
created_at: '2026-02-23T15:34:09-03:00'
updated_at: '2026-02-23T16:12:49-03:00'
repo: agentic_start_folder
branch: main
links:
  spec: 260223_1834_lint-doc-exclusions_spec-lite_01
  task: 260223_1834_lint-doc-exclusions_task_01
---

# Plan: lint-doc-exclusions

## Objective
- Make `make lint` focus on actionable operational docs by excluding teaching/orientation docs from lint scope.

## Scope
- In scope:
  - Exclude `.agents/a-docs/**` from `agents-lint-docs.py`.
  - Exclude orientation/generated docs (`.agents/arc/structure/**`, `.agents/scripts/.agent/docs/**`) from lint.
  - Keep lint execution stable and deterministic.
- Out of scope:
  - Rewriting standards/templates content.
  - Broad markdown cleanup in excluded docs.

## Success Criteria
- `make lint` returns exit 0 with no errors and no irrelevant warnings from excluded docs.
- `make all` still passes end-to-end.

## Delivery Strategy
1. Update exclusion rules in `agents-lint-docs.py`.
2. Re-run lint and full validation targets.
3. Record evidence in report and lessons.

## Critical Dependencies
- Tools:
  - `make`
  - `.agents/agents`
- MCPs:
  - None
- Skills:
  - None
- Executor instruction:
  - Keep changes minimal and avoid touching unrelated docs.

## Large Plan Handling
- If this plan exceeds 500 lines, split into phases.
- Create one task file per phase.

## Risks and Mitigations
- Risk: Excluding too much hides relevant issues -> Mitigation: exclude only folders explicitly requested (teaching/orientation).

## Verification Plan
- Unit: `N/A`
- E2E: `N/A`
- Typecheck: `N/A`
- Lint: `make lint`
- Other checks:
  - `make all` for integration-level validation.
  - `python3 -m py_compile .agents/scripts/agents-lint-docs.py` for syntax validation.

---
*Template: `.agents/a-docs/templates/plan.md`*
