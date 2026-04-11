---
doc_type: task
id: 260224_1030_scripts-lean-efficiency_task_02
theme: scripts-lean-efficiency
status: active
owners:
- worker
created_at: '2026-02-24T10:30:20-03:00'
updated_at: '2026-02-24T14:30:52-03:00'
depends_on:
- 260224_1030_scripts-lean-efficiency_task_01
links:
  plan: 260224_1030_scripts-lean-efficiency_plan_01
  spec: 260224_1030_scripts-lean-efficiency_spec-lite_01
---

# Tasks: Phase 2 - Surface Consolidation and Compatibility

## Phase Goal
- Reduce operational duplication in command surface while keeping backward compatibility.


## State Board
| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | worker | Analyzed - script not for daily use, removed from Makefile. |
| T-02 | done | worker | fix-lint-* surface is coherent. |
| T-03 | done | worker | .agents/agents refactored to command-map (210→147 lines). |
| T-04 | done | worker | All aliases validated (lint, verify, wb, map). |
| T-05 | done | worker | Wrapper logic consolidated. |
| T-06 | done | worker | Help output verified. |
| T-07 | done | worker | All parity checks passed. |
| T-08 | done | worker | Before/after captured in report. |

## Acceptance Criteria
- [x] All legacy public commands still execute successfully.
- [x] Command-surface duplication reduced with clear compatibility mapping.
- [x] Documentation updated for any command-path normalization.

## Verification Commands
```bash
make help
make lint-fix-check
make lint-fix-dry
make lint-fix
./.agents/agents help
./.agents/agents tools list
./.agents/agents tools info wb-update
make doctor
make lint
```

## Test Gate
- Move to `ready_for_test` after command parity checks pass.

---
*Template: `.agents/a-docs/templates/task.md`*
