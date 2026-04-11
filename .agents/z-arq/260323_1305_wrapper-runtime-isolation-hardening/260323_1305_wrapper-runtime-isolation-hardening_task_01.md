---
doc_type: task
id: 260323_1305_wrapper-runtime-isolation-hardening_task_01
theme: wrapper-runtime-isolation-hardening
status: active
owners:
- worker
- tester
created_at: '2026-03-23T13:05:37-03:00'
updated_at: '2026-03-23T13:59:10-03:00'
roadmap_feature: F-06
parent_spec: 260306_primary-agent-runtime-compatibility_spec_01
child_spec: ''
depends_on:
- 260323_1305_wrapper-runtime-isolation-hardening_plan_01
links:
  plan: 260323_1305_wrapper-runtime-isolation-hardening_plan_01
  roadmap: .agents/arc/GENERAL-ROADMAP.md
---

# Tasks: wrapper-runtime-isolation-hardening

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | worker | Hardened `.agents/agents` to prefer the local virtualenv and repo-local UV cache. |
| T-02 | done | worker | Added wrapper isolation regression coverage and closed CI lint coverage gaps. |
| T-03 | done | tester | Verified the corrected runtime path, updated standards docs, and recorded the lesson. |

**State values:** `pending` | `in_progress` | `ready_for_test` | `testing` | `done` | `blocked`

## Governance Context
- Roadmap feature: `F-06`
- Parent spec: `260306_primary-agent-runtime-compatibility_spec_01`
- Child spec: ``

## Test Gate
- Record command output in the report before marking tasks done.

## Implementation Checkpoint
- Files touched:
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
- Key decisions:
  - Normal wrapper execution now runs through the local virtualenv directly.
  - `uv` remains only on the setup path, with cache writes redirected into the repo.
  - CI now runs Python script linting in addition to existing validations.

### Test Evidence
- Command: `make lint-scripts`
- Result: pass
- Evidence: `All checks passed!`
- Command: `make test-scripts`
- Result: pass
- Evidence: `117 passed, 6 deselected`
- Command: `make lint`
- Result: pass
- Evidence: `Files checked: 278`, `Issues found: 0`
- Command: `make doctor`
- Result: pass
- Evidence: wrapper still validated with `PATH=/usr/bin:/bin ./.agents/agents doctor`
- Command: `make all`
- Result: pass
- Evidence: `✓ All validations passed`

## Task List
- [x] T-01 Harden the wrapper and validation entrypoints for isolated runtime operation.
- [x] T-02 Add automated regression coverage for wrapper isolation and CI gate coverage.
- [x] T-03 Run repo verification, update standards docs, and record a lesson.
- [ ] T-04 integration-test-task
