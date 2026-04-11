---
doc_type: report
id: 260323_1305_wrapper-runtime-isolation-hardening_report_01
theme: wrapper-runtime-isolation-hardening
status: active
created_at: '2026-03-23T13:05:37-03:00'
updated_at: '2026-03-23T13:59:10-03:00'
roadmap_feature: F-06
parent_spec: 260306_primary-agent-runtime-compatibility_spec_01
child_spec: ''
related_tasks:
- T-01
- T-02
- T-03
links:
  roadmap: .agents/arc/GENERAL-ROADMAP.md
  plan: 260323_1305_wrapper-runtime-isolation-hardening_plan_01
  task: 260323_1305_wrapper-runtime-isolation-hardening_task_01
---

# Report: wrapper-runtime-isolation-hardening

## Summary
- Hardened the runtime wrapper and validation path so the scaffold remains usable as an isolated base for downstream agent execution.

## Delivered Changes
- Changed `.agents/agents` to run through `.agents/scripts/.venv` directly during normal command execution.
- Restricted `uv` usage to environment provisioning and redirected UV cache writes to `.agents/cache/uv`.
- Refactored catchup/review/session helpers so Python script linting is green again.
- Added a wrapper isolation regression test and updated CI to run `make lint-scripts`.
- Updated operational docs to describe the hermetic wrapper contract.
- Recorded the runtime-isolation lesson from the user correction.

## Files Changed
- `.agents/agents`
- `.agents/a-docs/standards/Makefile`
- `.agents/scripts/agents-review.py`
- `.agents/scripts/agents-session.py`
- `.agents/scripts/lib/execution_commands.py`
- `.agents/scripts/tests/test_runtime_compatibility.py`
- `.github/workflows/agents-scaffold-ci.yml`
- `.agents/scripts/README.md`
- `.agents/a-docs/standards/agents-usage.md`
- `.agents/a-docs/standards/scripts-usage.md`
- `README.md`
- `.agents/a-docs/lessons/entries/20260323_1310_wrapper-must-be-hermetic-in-isolated-runtimes.md`

## Verification
- Unit tests: `make test-scripts` -> pass -> Evidence: `117 passed, 6 deselected`
- Lint: `make lint` -> pass -> Evidence: `Files checked: 278`, `Issues found: 0`
- Additional checks:
  - `make lint-scripts` -> pass -> Evidence: `All checks passed!`
  - `make doctor` -> pass -> Evidence: structure/runtime compatibility checks passed
  - `PATH=/usr/bin:/bin ./.agents/agents doctor` -> pass -> Evidence: wrapper worked without `uv` on `PATH`
  - `make all` -> pass -> Evidence: `✓ All validations passed`

## Risks / Follow-ups
- In this Codex execution sandbox, subprocess-based write operations against the repo still raise `Errno 30` on integration tests that mutate workbench files. The wrapper runtime bug is fixed, but this environment-specific write restriction still prevents full write-path integration coverage here.
