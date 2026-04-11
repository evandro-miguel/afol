---
doc_type: task
id: 260224_1030_scripts-lean-efficiency_task_03
theme: scripts-lean-efficiency
status: active
owners:
- worker
created_at: '2026-02-24T10:30:20-03:00'
updated_at: '2026-02-24T14:30:52-03:00'
depends_on:
- 260224_1030_scripts-lean-efficiency_task_02
links:
  plan: 260224_1030_scripts-lean-efficiency_plan_01
  spec: 260224_1030_scripts-lean-efficiency_spec-lite_01
---

# Tasks: Phase 3 - Complexity Reduction and Internal Structure

## Phase Goal
- Reduce complexity hotspots and centralize shared helpers without changing external behavior.


## State Board
| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | done | worker | Baseline: 26 C901 violations captured. |
| T-02 | done | worker | validate_catalog (C901=24) refatorado em 3 helpers. Removido da lista. |
| T-03 | done | worker | agents-telemetry.py: generate_report (C901=14) e calculate_heat_scores (C901=20) refatorados. |
| T-04 | done | worker | agents-new.py: main (C901=20) refatorado em 5 funções menores. |
| T-05 | done | worker | check_frontmatter (C901=16) e validate_frontmatter (C901=12) refatorados. |
| T-06 | done | worker | Helpers extraídos: 16 funções em 3 arquivos. |
| T-07 | done | worker | Imports adicionados (Dict, Optional, timedelta). |
| T-08 | done | worker | C901: 26 → 22 violations (4 funções removidas da lista). |
| T-09 | done | worker | 12 tests passing after all refactors. |

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
