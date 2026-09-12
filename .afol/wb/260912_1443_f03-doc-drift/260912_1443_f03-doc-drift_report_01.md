# Report: 260912_1443_f03-doc-drift

## Summary
declared: Calibrated remaining active docs to n/st/d-x/c; qt hints afol s; start --brief keeps d -x hint. Lessons historical.

## Tasks
- T-01: done
- T-02: done
- T-03: done
- T-04: done

## Evidence
- T-01 attempt=1 evidence_id=E-20260912144415776-f1dba0 authorizing: passed (test -f .tmp/drift-long-path-inventory.md; exit_code=0)
- T-02 attempt=1 evidence_id=E-20260912144712713-27ff7d authorizing: passed (bun .tmp/check-t02-doc-happy-path.mjs; exit_code=0)
- T-03 attempt=1 evidence_id=E-20260912145155456-c9ae67 authorizing: passed (bun test cli/tests/workbench-hints.test.ts cli/tests/workbench-lifecycle.test.ts; exit_code=0)
- T-04 attempt=1 evidence_id=E-20260912145828368-b1d13a authorizing: passed (bun .tmp/check-t04-leftover.mjs; exit_code=0)
