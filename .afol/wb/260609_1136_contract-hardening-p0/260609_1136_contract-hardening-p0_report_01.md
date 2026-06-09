# Report: contract-hardening-p0

## STATUS

passed

## TASK

Delegated P0/P1 contract hardening for AFOL kernel reliability.

## FILES_WRITTEN

- `cli/validate/contract.ts`
- `cli/tests/validation.test.ts`
- `cli/services/workbench/lifecycle.ts`
- `cli/services/workbench/verify.ts`
- `cli/commands/file.ts`
- `cli/tests/workbench-lifecycle.test.ts`
- `cli/tests/workbench-verify.test.ts`
- `cli/tests/mutation-safety.test.ts`
- `cli/commands/bootstrap.ts`
- `cli/services/update/check.ts`
- `cli/commands/init.ts`
- `cli/tests/bootstrap.test.ts`
- `cli/tests/update-command.test.ts`
- `cli/tests/kernel.test.ts`

## VALIDATION_OR_CHECKS

- `bun run typecheck` passed.
- `bun test cli/tests/validation.test.ts` passed.
- `bun test cli/tests/workbench-lifecycle.test.ts cli/tests/workbench-verify.test.ts cli/tests/mutation-safety.test.ts` passed.
- `bun test cli/tests/bootstrap.test.ts cli/tests/bootstrap-conflicts.test.ts cli/tests/update-command.test.ts` passed.
- `bun test cli/tests/kernel.test.ts` passed.
- `./afol validate --json` passed with `summary.total=9`, `failed=0`.
- `git diff --check` clean per final auditor.
- Post-close verification rerun passed:
  - `git diff --check`
  - `./afol verify-tasks --session 260609_1136_contract-hardening-p0 --strict`
  - `bun run typecheck`
  - focused validation/workbench/mutation/bootstrap/update/kernel test matrix
  - `./afol validate --json`
  - `bun test` (`131 pass`, `0 fail`)
  - `bun run validate:release`
  - `bun run smoke:clean`
  - `./afol local-state freshness`
  - `./afol validate project`

## SUMMARY

- Benchmarks now exit non-zero when payload status is failed.
- Validation selectors route update and mutation-sensitive paths to the correct packs.
- `closeSession()` now enforces strict workbench evidence verification.
- Workbench done/verify use shared success-evidence semantics.
- File command `blocked` results now return non-zero.
- Provider-compatible bootstrap preserves mutable `.agents` roots by default.
- Destructive provider-compatible cleanup requires explicit `--cleanup-provider-compatible-mutable` opt-in, including through `init`.
- Template update now reads embedded generated template payload, not downstream `src/project-template`.

## BLOCKERS

None after T-06/T-07 follow-ups and T-08 final audit.

## NEXT

- Optional later hardening: binary/atomic file write safety.
- Optional later release hardening: security scan required mode and stricter tooling gates.
