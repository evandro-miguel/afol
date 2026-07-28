# Report: 260728_1558_evolution-review-remediation

## Summary
Resolved actionable evolution review findings: compatible versioned import identities and journal recovery, complete preference journal schema, exact bounded tail reads, and recurrence regression coverage.

## Tasks
- T-01: done — Version external session snapshots and preserve canonical retry links attempt=1
- T-02: done — Align preference journal events with the canonical schema attempt=1
- T-03: done — Harden bounded tail readers against short reads attempt=1
- T-04: done — Add regression coverage for unqualified observations attempt=1

## Evidence
- T-01: passed (TMPDIR=/home/maku/dev/apps/afol/tmp/test-run bun test cli/tests/evolution-import-service.test.ts cli/tests/evolution-import-store.test.ts; exit_code=n/a)
- T-02: passed (bun test cli/tests/evolution-governance-schema.test.ts; exit_code=n/a)
- T-03: passed (bun test cli/tests/evolution-suggestion-hardening.test.ts; exit_code=n/a)
- T-04: passed (bun test cli/tests/evolution-observation-ingest.test.ts; exit_code=n/a)
- T-01: passed (bun test cli/tests/evolution-import-service.test.ts && bun test cli/tests/evolution-import-store.test.ts -t 'rebuilds a missing projection'; exit_code=0)
- T-02: passed (bun test cli/tests/evolution-governance-schema.test.ts; exit_code=0)
- T-03: failed (bun test cli/tests/evolution-suggestion-hardening.test.ts; exit_code=1)
- T-03: failed (TMPDIR=/home/maku/dev/apps/afol/tmp bun test cli/tests/evolution-suggestion-hardening.test.ts; exit_code=1)
- T-03: failed (bun test cli/tests/evolution-suggestion-hardening.test.ts; exit_code=1)
- T-03: passed (bun test cli/tests/evolution-suggestion-hardening.test.ts -t 'bounded tail'; exit_code=0)
- T-04: passed (bun test cli/tests/evolution-observation-ingest.test.ts -t 'unqualified failures remain observable'; exit_code=0)
- T-01: passed (bun run typecheck && bun test cli/tests/evolution-import-service.test.ts; exit_code=n/a)
