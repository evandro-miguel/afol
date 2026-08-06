# Report: 260806_1158_release-promotion-remediation

## Summary
declared: Resolved T-01 hash-bound legacy evidence compatibility, T-02 reproducible compiled artifact with atomic provenance and receipt binding, and T-03 fast-uri security override plus release-gate ordering. Recorded focused evidence and deterministic build; bun run validate:release passed.

## Tasks
- T-01: done
- T-02: done
- T-03: done

## Evidence
- T-03: declared passed (osv-scanner scan --lockfile bun.lock --format json; exit_code=n/a)
- T-03: declared passed (bun test cli/tests/evolution-governance-schema.test.ts; exit_code=n/a)
- T-03: passed (bun test cli/tests/evolution-governance-schema.test.ts; exit_code=0)
- T-01: declared passed (bun run typecheck && bun test cli/tests/validate-command.test.ts cli/tests/verify-command.test.ts cli/tests/workbench-verify.test.ts; exit_code=n/a)
- T-01: passed (bun run typecheck && bun test cli/tests/validate-command.test.ts cli/tests/verify-command.test.ts cli/tests/workbench-verify.test.ts; exit_code=0)
- T-02: passed (bun run build:deterministic; exit_code=0)
