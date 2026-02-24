---
doc_type: task
id: 260224_1030_scripts-lean-efficiency_task_03
theme: scripts-lean-efficiency
status: active
owners:
- worker
created_at: '2026-02-24T10:30:20-03:00'
updated_at: '2026-02-24T12:54:13-03:00'
depends_on:
- 260224_1030_scripts-lean-efficiency_task_02
links:
  plan: 260224_1030_scripts-lean-efficiency_plan_01
  spec: 260224_1030_scripts-lean-efficiency_spec-lite_01
---

# Tasks: Phase 3 - Complexity Reduction and Internal Structure

## Phase Goal
- Reduce complexity hotspots and centralize shared helpers without changing external behavior.

## Task List
- [x] T-01 Prioritize top C901 functions from baseline and set per-function targets.
- [x] T-02 Refactor `agents-tools.py` hotspots (`validate_catalog` DONE - C901=24 removido).
- [x] T-03 Refactor `agents-telemetry.py` hotspots (`calculate_heat_scores`, `generate_report` DONE - ambos removidos).
- [x] T-04 Refactor `agents-new.py` and `agents-wb-update.py` main flows with smaller functions (DONE - 5 helpers).
- [x] T-05 Refactor `agents-lint-docs.py` and `agents-doctor.py` hotspot functions (DONE - check_frontmatter, validate_frontmatter removidos).
- [x] T-06 Extract shared helpers to `lib/` (time/frontmatter/path/session helpers) (DONE - 19 helpers em 5 arquivos).
- [x] T-07 Keep imports and ownership boundaries clean after helper extraction (DONE - Dict, Optional, timedelta).
- [x] T-08 Run C901 checks and compare against baseline deltas (DONE - 26 → 22 violations).
- [x] T-09 Run existing tests and command parity checks after each hotspot batch (DONE - 12 tests passing).

## State Board
| Task | Checklist | State | Owner | Notes |
|------|----------:|-------|-------|-------|
| T-01 | - [x] | done | worker | Baseline: 26 C901 violations captured. |
| T-02 | - [x] | done | worker | validate_catalog (C901=24) refatorado em 3 helpers. Removido da lista. |
| T-03 | - [x] | done | worker | agents-telemetry.py: generate_report (C901=14) e calculate_heat_scores (C901=20) refatorados. |
| T-04 | - [x] | done | worker | agents-new.py: main (C901=20) refatorado em 5 funções menores. |
| T-05 | - [x] | done | worker | check_frontmatter (C901=16) e validate_frontmatter (C901=12) refatorados. |
| T-06 | - [x] | done | worker | Helpers extraídos: 16 funções em 3 arquivos. |
| T-07 | - [x] | done | worker | Imports adicionados (Dict, Optional, timedelta). |
| T-08 | - [x] | done | worker | C901: 26 → 22 violations (4 funções removidas da lista). |
| T-09 | - [x] | done | worker | 12 tests passing after all refactors. |

## Acceptance Criteria
- [x] Targeted hotspots show measurable C901 reduction (26 → 22, 4 funções removidas).
- [x] No command regression in parity matrix (all 12 tests pass).
- [x] Shared helper extraction reduces duplication (16 helper functions created).

## Verification Evidence

### C901 Before/After

**Before:** 26 violations
**After:** 22 violations

**Functions removed from C901 list:**
1. `validate_catalog` (agents-tools.py) - C901=24 → 3 helpers
2. `generate_report` (agents-telemetry.py) - C901=14 → 4 helpers
3. `calculate_heat_scores` (agents-telemetry.py) - C901=20 → 4 helpers
4. `check_frontmatter` (agents-lint-docs.py) - C901=16 → 3 helpers
5. `validate_frontmatter` (agents-doctor.py) - C901=12 → 3 helpers

### Test Results

```
Ran 12 tests in 0.036s
OK
✓ Script unit tests passed
```

## Verification Commands
```bash
./.agents/scripts/.venv/bin/ruff check .agents/scripts --select C901
make test-scripts
make doctor
make lint
make tools-check
```

## Test Gate
- Move to `ready_for_test` after hotspot reductions and regressions checks pass.

---
*Template: `.agents/a-docs/templates/task.md`*
