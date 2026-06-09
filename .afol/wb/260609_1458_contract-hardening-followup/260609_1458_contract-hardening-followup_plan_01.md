# Plan: contract-hardening-followup

- Created by native CLI workbench lifecycle.

## Native command metadata
- feature_id: F-11
- parent_spec: docs/arc/SPECS/260521_0110_validation-ci-and-benchmarks_spec_01.md
- task: Finish remaining P0/P1 contract hardening from external review

## Execution Plan

- T-01: Orchestrate follow-up hardening, preserve existing dirty work, and integrate slice reports.
- T-02: Update path safety. Finish `afol update` as an embedded-template managed-file updater: all managed files, normalized managed hashes, backup/journal/atomic writes, and focused update tests.
- T-03: Mutation/file safety. Return blocked file operations with exit code 4, block text patching for binary files, keep move/archive byte-safe, and add focused mutation tests.
- T-04: Release/toolchain safety. Add required security scan mode for release, switch release lint to Biome `ci` or `check`, tighten Knip release threshold, and harden version/provenance fields where scope permits.
- T-05: Runtime/catalog safety. Wrap `validateProjectStructure()` into structured CLI failures, make rule/skill catalog parsing resilient, and hide or internalize delegate-only public commands without breaking native AFOL routes.
- T-06: Verifier audit after builders: changed-symbol impact, targeted tests, typecheck, validation selection, and release-gate recommendation.

## Validation

- Builder A: `bun test cli/tests/update-command.test.ts cli/tests/bootstrap.test.ts`.
- Builder B: `bun test cli/tests/mutation-safety.test.ts`.
- Builder C: `bun run validate:toolchain` or focused package/dev-script tests if the full toolchain gate exposes pre-existing dependency issues.
- Builder D: `bun test cli/tests/validation.test.ts cli/tests/kernel.test.ts cli/tests/local-state-indexes.test.ts`.
- Verifier: `gitnexus detect-changes -r agentic-start-folder`, `git diff --check`, targeted matrix above, `bun run typecheck`, `./afol validate --json`, then `bun test` and `bun run validate:release` if focused gates pass.

## Closure Criteria

- No listed P0 remains unhandled without an explicit moved destination and reason.
- P1 items touched by release/update/runtime safety have tests or structured validation coverage.
- Remaining P2 items are either fixed where cheap and isolated or moved to a named follow-up.
- Existing dirty work from `260609_1136_contract-hardening-p0` is preserved unless directly superseded by this session.
- Slice reports list files changed, GitNexus impact results, commands run, and residual risks.

## Plan Review

- Verdict: locked.
- In scope: P0/P1 contract gaps that are still present after the previous `contract-hardening-p0` session, plus small P2 fixes only when they are local to a touched file.
- Out of scope: broad Node-to-Bun process wrapper migration, full public package release policy, complete E2E smoke expansion, and speculative dependency architecture changes.
- Failure modes covered: partial update write, binary corruption through text patching, release passing without required scanners, stale or invalid catalog files crashing validation, and legacy delegate commands appearing public.
- Parallelization: parallel lanes with disjoint write scopes. Merge-conflict risk is highest in tests and `package.json`; the orchestrator owns sequencing there.
