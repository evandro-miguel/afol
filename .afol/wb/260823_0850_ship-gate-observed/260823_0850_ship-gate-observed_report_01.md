# Report: 260823_0850_ship-gate-observed

## Summary
closed: 5 tasks; evidence: 6 observed, 1 failed

## Tasks
- T-01: done
- T-02: done
- T-03: done
- T-04: done
- T-05: done

## Evidence
- T-01 attempt=1 evidence_id=E-20260823085035992-966feb authorizing: passed (bun run manifest:check; exit_code=0)
- T-02 attempt=1 evidence_id=E-20260823085042188-579cbe authorizing: passed (bun run validate:toolchain; exit_code=0)
- T-03 attempt=1 evidence_id=E-20260823085348805-f37f45 authorizing: passed (bun test --only-failures; exit_code=0)
- T-04 attempt=1 evidence_id=E-20260823085400604-b9cc68 authorizing: passed (bun run validate:security:release; exit_code=0)
- T-05 attempt=1 evidence_id=E-20260823085405514-e6953d: failed (bun run kernel -- v project --strict; exit_code=1)
- T-05 attempt=1 evidence_id=E-20260823085426227-b61e24 authorizing: passed (bun run kernel -- v project --strict; exit_code=0)
