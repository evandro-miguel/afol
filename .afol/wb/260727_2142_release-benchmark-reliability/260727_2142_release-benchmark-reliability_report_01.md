# Report: 260727_2142_release-benchmark-reliability

## Summary
Strict verification passed for 3 tasks.

## Tasks
- T-01: done — Define compatible mutation benchmark timing and baseline contract attempt=1
- T-02: done — Restore governance scenario coverage for the reconciled F-29 spec attempt=1
- T-03: done — Validate release gates and document residual environment limits attempt=1

## Evidence
- T-02: passed (bun test cli/tests/validate-internals.test.ts; exit_code=n/a)
- T-02: passed (bun test cli/tests/validate-internals.test.ts -t 'loads the real catalog'; exit_code=0)
- T-03: passed (afol validate project --json; exit_code=n/a)
- T-03: failed (bun run validate:release; exit_code=n/a)
- T-03: passed (afol validate project --json; exit_code=0)
- T-01: failed (bun run validate:mutation-performance >/dev/null; exit_code=2)
- T-01: passed (bash -lc "bun run validate:mutation-performance >/dev/null"; exit_code=0)
