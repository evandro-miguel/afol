# Report: 260726_1553_governance-contract-reconciliation

## Summary
Reconciled F-01, F-11, F-13, and F-15 with the AFOL-only runtime; preserved exact originals and passed focused governance, drift, type, formatting, manifest, Gitleaks, and OSV checks.

## Tasks
- T-01: done — Reconcile final F-01, F-11, F-13, and F-15 governance contracts with the AFOL-only runtime attempt=1

## Evidence
- T-01: passed (bun test cli/tests/governance-contract-reconciliation.test.ts; exit_code=n/a)
- T-01: passed (./afol ctx build; exit_code=n/a)
- T-01: passed (bun test --timeout 30000 cli/tests/canonical-context-index.test.ts; exit_code=n/a)
- T-01: passed (bun test --timeout 30000 cli/tests/context-system.test.ts; exit_code=n/a)
- T-01: passed (bun test --timeout 30000 cli/tests/validation.test.ts --test-name-pattern "plain validate stays on structural validation"; exit_code=n/a)
- T-01: passed (/home/maku/dev/apps/afol/node_modules/.bin/biome check cli/tests/governance-contract-reconciliation.test.ts; exit_code=n/a)
- T-01: failed (bun run typecheck; exit_code=n/a)
- T-01: passed (bun test cli/tests/governance-contract-reconciliation.test.ts; exit_code=n/a)
- T-01: passed (./afol ctx build; exit_code=n/a)
- T-01: passed (bun test cli/tests/canonical-context-index.test.ts cli/tests/context-system.test.ts cli/tests/validation.test.ts; exit_code=n/a)
- T-01: passed (./afol local-state rebuild --json; exit_code=n/a)
- T-01: passed (./afol validate project --check-drift --json; exit_code=n/a)
- T-01: passed (bun run typecheck; exit_code=n/a)
- T-01: passed (./node_modules/.bin/biome check cli/tests/governance-contract-reconciliation.test.ts; exit_code=n/a)
- T-01: passed (bun run manifest:check; exit_code=n/a)
- T-01: passed (/tmp/afol-security-tools-final/gitleaks git . --redact --no-banner; exit_code=n/a)
- T-01: passed (/tmp/afol-security-tools-final/gitleaks dir . --redact --no-banner; exit_code=n/a)
- T-01: passed (/tmp/afol-security-tools-final/osv-scanner scan source --lockfile bun.lock .; exit_code=n/a)
- T-01: passed (bun test cli/tests/governance-contract-reconciliation.test.ts; exit_code=0)
