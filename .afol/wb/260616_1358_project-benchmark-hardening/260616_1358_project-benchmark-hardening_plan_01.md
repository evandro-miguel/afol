# Plan: project-benchmark-hardening

- Created by native CLI workbench lifecycle.

## Native command metadata
- intent: delivery
- feature_id: F-11
- parent_spec: 260521_0110_validation-ci-and-benchmarks_spec_01
- task: Harden project-benchmark scoring, validation, generation, and release gates

## Execution Plan

- T-01: Governance and generation safety.
  - Thread `OperationContext` from `cli/main.ts` into `runProjectBenchmarkCommand`.
  - Block mutating `pb generate` for restricted agent/remote contexts.
  - Keep future `pb generate --check` read-only.
  - Replace direct generated-output writes with the repo atomic write helper and a narrow generation lock.
  - Add kernel/command tests for denied restricted generation and local generation success.
- T-02: Generated-output drift and release gate.
  - Add `afol pb generate --check`.
  - Compare expected generated artifacts with `.afol/data/project-benchmarks/*` without writing.
  - Add `afol pb validate --strict`; warnings become release-blocking only in strict mode.
  - Wire `validate:project-benchmarks` / `validate:release` through strict validate and generated-output check.
  - Add tests for stale generated files and strict warning behavior.
- T-03: Scoring contract.
  - Add `overall_score` and `focused_score` to scored benchmark outputs.
  - Keep `score` as a compatibility alias during this correction unless tests prove no consumers depend on it.
  - Sort default list/matrix outputs by `overall_score`, then `focused_score`, then id.
  - Update renderers, generated artifacts, and tests.
- T-04: Runtime validator hardening.
  - Fix null/non-object project JSON so validation returns issues instead of crashing.
  - Align manual validation with the catalog schema for id pattern, unknown properties, empty `similarity_axes`, duplicate `source_refs`, URL shape, and real calendar dates.
  - Add focused validator tests for each rejected shape.
- T-05: Recommendation and low-token UX.
  - Penalize or warn on stale, low-confidence, `docs_only`, `closed_source`, and `adjacent_reference` recommendations.
  - Include first validation issues in JSON catalog-failure responses.
  - Add `pb matrix --for <axis>` and normalized `pb show <name>` lookup if this does not broaden the schema.
  - Keep registry side-effect metadata unchanged unless a runtime policy consumer is found.
- T-06: Integration verification and closeout.
  - Review combined diff for overlap and generated artifacts.
  - Run focused project-benchmark tests, `bun run typecheck`, `bun test`, `./afol validate project`, and `bun run validate:release`.
  - Record evidence before marking tasks done.

## Validation

- T-01: `bun test cli/tests/project-benchmark-command.test.ts cli/tests/kernel.test.ts`.
- T-02: same focused tests plus `bun run validate:project-benchmarks`.
- T-03: focused project-benchmark tests and `./afol pb list --json`.
- T-04: focused validator tests.
- T-05: focused command/render tests.
- T-06: `git diff --check && bun run typecheck && bun test && ./afol validate project && bun run validate:release`.

## Closure Criteria

- Tasks are marked done only after passed task-scoped evidence exists.
- Generated files are either unchanged by the check or regenerated intentionally.
- No legacy `.agents` runtime surface is restored or extended.
- Delivery notes identify changed files, verification results, and residual risks.
