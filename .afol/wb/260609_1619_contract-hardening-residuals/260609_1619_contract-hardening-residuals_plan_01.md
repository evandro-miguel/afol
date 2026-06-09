# Plan: contract-hardening-residuals

- Created by native CLI workbench lifecycle.

## Native command metadata
- feature_id: F-11
- parent_spec: docs/arc/SPECS/260521_0090_template-update-and-versioning_spec_01.md
- task: Finish remaining contract hardening residuals from external review

## Execution Plan

- T-01: Orchestrate residual hardening and keep task/evidence state accurate.
- T-02: Public version/provenance contract.
  - Set package metadata to a real prerelease semver for this AFOL TS kernel and make `afol --version` stop advertising `0.0.0`.
  - Preserve provenance fields already added and verify `afol --version`.
- T-03: Process, atomic write, local-state, and evidence helpers.
  - Run sequentially after T-02/T-04/T-05 handoffs because workbench/local-state has critical blast radius.
  - Add/reuse a narrow atomic text write helper with temp/rename/fsync for update/workbench/local-state critical writes.
  - Make workbench local-state freshness create `files.json` predictably.
  - Unify success evidence semantics and make evidence ids collision-resistant.
  - Leave broad `node:child_process` to `Bun.spawnSync` migration out of this slice unless a touched path needs it for a test.
- T-04: Bootstrap migration contracts.
  - Reject `--partial` with a clear unsupported-argument error in both bootstrap and init forwarding instead of accepting and ignoring it.
  - Replace provider-compatible mutable cleanup deletion with explicit archive plus confirm semantics.
  - Required cleanup path is `--cleanup-provider-compatible-mutable --confirm-provider-migration`; without confirm, report preserved/pending and do not mutate legacy roots.
- T-05: Release smoke depth.
  - Pure verifier/support lane: add or update a smoke script/test that exercises built `dist/afol` in a tmp repo through bootstrap/status/session/start/evidence/done/close.
  - Do not change bootstrap or workbench product behavior in this task.
- T-06: Integrated verification and closeout.
  - Run focused tests for each slice, then `bun run typecheck`, `bun test`, `./afol validate --json`, and `bun run validate:release`.

## Validation

- T-02: `bun test cli/tests/version-metadata.test.ts cli/tests/release-toolchain.test.ts`.
- T-03: focused workbench/local-state/update tests plus typecheck.
- T-04: `bun test cli/tests/bootstrap.test.ts cli/tests/kernel.test.ts`.
- T-05: `bun run smoke:dist` or the focused smoke test that backs it.
- T-06: full integrated gate: `git diff --check && bun run typecheck && bun test && ./afol validate --json && bun run validate:release`.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- No unresolved failed evidence remains in the session.
- Delivery notes identify changed behavior, verification, residual risks, and the large Biome-format baseline already introduced by the previous slice.
