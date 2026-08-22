# Report: 260822_1523_warn-vs-block-advisory-gates

## Summary
closed: 3 tasks; evidence: 3 observed, 0 failed

## Tasks
- T-01: done
- T-02: done
- T-03: done

## Evidence
- T-02 attempt=1 evidence_id=E-20260822154646630-1d8950 authorizing: passed (bun test --only-failures cli/tests/workbench-verify.test.ts cli/tests/workbench-lifecycle.test.ts cli/tests/legacy-reconcile.test.ts; exit_code=0)
- T-01 attempt=1 evidence_id=E-20260822154958984-6d64ce authorizing: passed (bun run template:check; exit_code=0)
- T-03 attempt=1 evidence_id=E-20260822161731021-9f45fb authorizing: passed (bun test --only-failures cli/tests/health-system.test.ts cli/tests/validate-command.test.ts cli/tests/registry.test.ts cli/tests/help.test.ts cli/tests/release-toolchain.test.ts; exit_code=0)
