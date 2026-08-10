# Report: 260806_2000_branch-drain

## Summary
closed: 2 tasks; evidence: 2 observed, 12 failed

## Tasks
- T-01: done
- T-02: done

## Evidence
- T-01: declared failed (git merge --no-ff fix/project-finalization (failed: 9 content conflicts; aborted); exit_code=n/a)
- T-01: declared failed (bun test cli/tests/hot-path-benchmark.test.ts cli/tests/dist-smoke-receipts.test.ts (failed: compiled scenario cannot resolve diff and valibot); exit_code=n/a)
- T-01: declared failed (git merge --no-ff fix/compiled-benchmark-provenance (failed: new conflict in cli/tests/hot-path-benchmark.test.ts; aborted); exit_code=n/a)
- T-01: declared passed (bun test cli/tests/hot-path-benchmark.test.ts cli/tests/dist-smoke-receipts.test.ts; exit_code=n/a)
- T-01: declared passed (bun test cli/tests/hot-path-benchmark.test.ts; exit_code=n/a)
- T-01: declared failed (git merge --no-ff fix/closed-history-evidence-boundary (failed: new conflicts in cli/services/project/validate.ts and cli/tests/validate-command.test.ts; aborted); exit_code=n/a)
- T-01: declared failed (bun test cli/tests/validate-command.test.ts (failed: 2 legacy hash-bound admission fixtures lack explicit closure under new guard); exit_code=n/a)
- T-01: declared failed (bun test cli/tests/validate-command.test.ts (failed: 2 legacy hash-bound admission fixtures still rejected after canonical id and updated_at additions); exit_code=n/a)
- T-01: declared failed (bun test cli/tests/validate-command.test.ts (failed: legacy admission tests expected exit 0 but received 1 after canonical close fields); exit_code=n/a)
- T-01: declared failed (git merge --no-ff fix/governance-coverage-matrix (failed: conflicts in GENERAL-ROADMAP.md and F-29 parent spec; aborted); exit_code=n/a)
- T-01: declared failed (afol validate project --check-drift --json (failed: stale workbench, specs, and files local-state indexes); exit_code=n/a)
- T-01: declared passed (afol local-state rebuild --json && afol validate project --check-drift --json; exit_code=n/a)
- T-01: declared failed (git merge --no-ff chore/finalize-session-artifacts (failed: conflicts in 260801 project-finalization log and report; aborted); exit_code=n/a)
- T-01: declared failed (bun run validate:release (failed: biome formatting required in cli/tests/hot-path-benchmark.test.ts and cli/validate/hot-path-benchmark.ts); exit_code=n/a)
- T-01: declared failed (bun run validate:release (failed: release provenance requires clean checkout; untracked branch-drain AFOL session artifacts); exit_code=n/a)
- T-01: declared passed (bun run validate:release (clean sibling worktree chore/release-gate-clean-20260806 at e5cc0df48a92); exit_code=n/a)
- T-01: passed (bun run typecheck; exit_code=0)
- T-02: passed (bun run validate:release; exit_code=0)
