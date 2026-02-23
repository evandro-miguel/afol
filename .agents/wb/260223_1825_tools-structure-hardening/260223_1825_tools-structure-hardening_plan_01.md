---
doc_type: plan
id: 260223_1825_tools-structure-hardening_plan_01
theme: tools-structure-hardening
status: active
owners:
- orchestrator
created_at: '2026-02-23T15:25:57-03:00'
updated_at: '2026-02-23T16:12:49-03:00'
repo: agentic_start_folder
branch: main
links:
  spec: 260223_1825_tools-structure-hardening_spec-lite_01
  task: 260223_1825_tools-structure-hardening_task_01
---

# Plan: tools-structure-hardening

## Objective
- Restore reliability of core `.agents` operational commands (`lint`, `structure`, `new`) with minimal code changes and deterministic verification.

## Scope
- In scope:
  - Fix crash paths in `agents-lint-docs.py`.
  - Fix hidden-directory scan behavior in `agents-structure-map.py` for repos centered on `.agents/`.
  - Fix placeholder replacement order in `agents-new.py`.
  - Regenerate structure map and capture evidence.
- Out of scope:
  - Broad normalization of all markdown/frontmatter warnings in historical docs.
  - Any behavior change in non-related scripts.

## Success Criteria
- `make lint` completes without Python exceptions.
- `make structure` generates section files in `.agents/arc/structure/`.
- `make new ...` creates IDs/links with resolved session IDs (no `YYMMDD_HHMM_*` leftovers).

## Delivery Strategy
1. Reproduce failures and isolate root causes.
2. Patch scripts with focused fixes.
3. Re-run make targets and document evidence in report.

## Critical Dependencies
- Tools:
  - `make`
  - `.agents/agents`
  - `uv`
- MCPs:
  - None
- Skills:
  - None
- Executor instruction:
  - Preserve compatibility with existing markdown corpus and avoid breaking templates.

## Large Plan Handling
- If this plan exceeds 500 lines, split into phases.
- Create one task file per phase.

## Risks and Mitigations
- Risk: Linter fixes change warning counts unexpectedly -> Mitigation: keep exit behavior unchanged (errors still fail, warnings informational).
- Risk: Structure scan includes noisy hidden paths -> Mitigation: allowlist only `.agents/.agent/.github` and keep ignore list for heavy dirs.

## Verification Plan
- Unit: `N/A` (no test suite for scripts present).
- E2E: `N/A`.
- Typecheck: `N/A`.
- Lint: `make lint`.
- Other checks:
  - `make structure` and inspect generated files.
  - `make new THEME=id-fix-check SPEC=lite` and inspect generated frontmatter IDs.

---
*Template: `.agents/a-docs/templates/plan.md`*
