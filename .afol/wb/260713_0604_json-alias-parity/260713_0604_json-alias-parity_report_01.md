# Report: 260713_0604_json-alias-parity

## Summary
Registry-driven JSON aliases now produce identical machine-readable pre-dispatch denial envelopes; subprocess suite passed 52 tests.

## Tasks
- T-01: done — Make -j and --json produce identical machine-readable pre-dispatch denial envelopes attempt=1

## Evidence
- T-01: passed (bun test --only-failures cli/tests/kernel.test.ts; exit_code=0)
