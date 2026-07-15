# Report: 260713_0716_close-waiver-summary-conflict

## Summary
Reject contradictory close flags and distinguish missing reports from explicit waivers.

## Tasks
- T-01: done — Reject conflicting close summary and no-report waiver flags so the waiver reason cannot be discarded attempt=1

## Evidence
- T-01: passed (bun test --only-failures cli/tests/workbench-args.test.ts cli/tests/workbench-lifecycle.test.ts; exit_code=0)
