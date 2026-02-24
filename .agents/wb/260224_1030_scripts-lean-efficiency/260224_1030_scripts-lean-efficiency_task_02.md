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

## Task List
- [x] T-01 Analyzed `lint-fix-doctypes` - DECISION: Script is for validator updates, not daily use. Removed from Makefile to avoid confusion.
- [x] T-02 Ensure `fix-lint-*` command surface is coherent (`all`, `dry`, `check`, specialized helpers).
- [x] T-03 Refactor `.agents/agents` dispatch to command-map style while preserving command behavior.
- [x] T-04 Keep aliases for existing commands and validate old command paths still work.
- [x] T-05 Consolidate repeated wrapper logic where safe (without output regressions).
- [x] T-06 Verify command help/documentation for updated surface.
- [x] T-07 Run parity matrix checks for all modified commands.
- [x] T-08 Capture before/after diff of command surface in report.

## State Board
| Task | Checklist | State | Owner | Notes |
|------|----------:|-------|-------|-------|
| T-01 | - [x] | done | worker | Analyzed - script not for daily use, removed from Makefile. |
| T-02 | - [x] | done | worker | fix-lint-* surface is coherent. |
| T-03 | - [x] | done | worker | .agents/agents refactored to command-map (210→147 lines). |
| T-04 | - [x] | done | worker | All aliases validated (lint, verify, wb, map). |
| T-05 | - [x] | done | worker | Wrapper logic consolidated. |
| T-06 | - [x] | done | worker | Help output verified. |
| T-07 | - [x] | done | worker | All parity checks passed. |
| T-08 | - [x] | done | worker | Before/after captured in report. |

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
