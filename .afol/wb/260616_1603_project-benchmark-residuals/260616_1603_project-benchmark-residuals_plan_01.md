# Plan: project-benchmark-residuals

- Created by native CLI workbench lifecycle.

## Native command metadata
- intent: planning
- feature_id: F-11
- parent_spec: 260521_0110_validation-ci-and-benchmarks_spec_01
- task: T-01 evidence-per-axis contract and source reference validation
- task: T-02 downstream/catalog boundary and generated-output placement
- task: T-03 decision-safe recommend output and warning policy
- task: T-04 schema/runtime parity and catalog failure reporting
- task: T-05 help/registry UX for pb and command metadata
- task: T-06 dist smoke and release validation for project-benchmark

## Objective

- Close the remaining `afol pb/project-benchmark` review gaps without reopening
  the P0 work already fixed in `main_dev`.
- Keep the catalog a read-only strategic reference surface and preserve the
  downstream/generated-output boundary.

## Execution Contract

- Every task below is directly executable by a builder or verifier agent now.
- No task may broaden scope into unrelated AFOL commands, legacy `.agents`
  runtime surfaces, or non-`project-benchmark` behavior.
- Discovery is already sufficient for this plan; execution should start from
  the files and commands named here.

## Scope

- In scope: evidence-per-axis enforcement, catalog/runtime boundary checks,
  decision-safe recommendation output, schema/runtime parity, `pb` help and
  registry UX, and dist/release validation.
- Out of scope: unrelated product features, generic repo cleanup, legacy
  `.agents/runtime` or `.agents/wb` surfaces, and broad docs refresh outside
  the `pb` command/help path.

## Success Criteria

- Every benchmark score path carries evidence refs and validation rejects
  missing, malformed, or unreferenced axis evidence.
- Generated project-benchmark artifacts stay under `.afol/data/project-benchmarks`
  and never contaminate the runtime benchmark catalog.
- `pb recommend` output is decision-safe: warnings and ranking reflect stale,
  low-confidence, `docs_only`, `closed_source`, and `adjacent_reference`
  tradeoffs.
- Schema/runtime validation agrees on malformed JSON, invalid dates, unexpected
  properties, and catalog failure reporting.
- Help/registry UX keeps `pb` discoverable and consistent in text and JSON.
- `bun run validate:project-benchmarks`, `bun run smoke:dist`, and
  `bun run validate:release` pass after the fixes land.

## Delivery Strategy

1. T-01 evidence-per-axis contract and source reference validation.
   - Owner: builder.
   - Allowed write scope: `cli/services/project-benchmark/validate.ts`,
     `cli/services/project-benchmark/types.ts`,
     `.afol/adm/project-benchmarks/projects/**`,
     `cli/tests/project-benchmark-validation.test.ts`.
   - Forbidden: registry/help files, unrelated command surfaces, legacy
     runtime folders.
   - Validate: `bun test cli/tests/project-benchmark-validation.test.ts`.
2. T-02 downstream/catalog boundary and generated-output placement.
   - Owner: builder.
   - Allowed write scope: `cli/services/project-benchmark/generate.ts`,
     `cli/commands/project-benchmark.ts`,
     `cli/tests/project-benchmark-command.test.ts`,
     generated-output fixtures under `.afol/data/project-benchmarks/**`.
   - Forbidden: help/registry changes and non-`project-benchmark` commands.
   - Validate: `bun test cli/tests/project-benchmark-command.test.ts` and
     `bun run validate:project-benchmarks`.
3. T-03 decision-safe recommend output and warning policy.
   - Owner: builder.
   - Allowed write scope: `cli/services/project-benchmark/scoring.ts`,
     `cli/services/project-benchmark/render.ts`,
     `cli/tests/project-benchmark-command.test.ts`.
   - Forbidden: catalog schema changes unless the warning policy proves it
     needs them.
   - Validate: focused `project-benchmark` command tests for `recommend`,
     `list`, and `matrix`.
4. T-04 schema/runtime parity and catalog failure reporting.
   - Owner: builder.
   - Allowed write scope: `cli/services/project-benchmark/validate.ts`,
     `cli/tests/project-benchmark-validation.test.ts`,
     JSON error-path assertions in `cli/tests/project-benchmark-command.test.ts`.
   - Forbidden: rendering, registry, and help surfaces.
   - Validate: `bun test cli/tests/project-benchmark-validation.test.ts
     cli/tests/project-benchmark-command.test.ts`.
5. T-05 help/registry UX for pb and command metadata.
   - Owner: builder.
   - Allowed write scope: `cli/registry.ts`, `cli/help.ts`,
     `cli/tests/help.test.ts`, `cli/tests/registry.test.ts`.
   - Forbidden: validation/generation internals and catalog data.
   - Validate: `bun test cli/tests/help.test.ts cli/tests/registry.test.ts`.
6. T-06 dist smoke and release validation for project-benchmark.
   - Owner: verifier.
   - Allowed write scope: none unless a release-gate defect is isolated to
     `package.json` or a dist-smoke helper.
   - Forbidden: any unrelated product edit.
   - Validate: `git diff --check && bun run validate:project-benchmarks &&
     bun run smoke:dist && bun run validate:release`.

## Critical Dependencies

- Tools: `afol`, `bun`, `git`.
- MCPs: none required.
- Skills: `agentic-folder-sys`, `code-discovery`, `caveman`,
  `rtk-token-optimization`.
- Executor instruction: if a task discovers a broader dependency than expected,
  record the concrete file/command evidence and update the relevant risk rather
  than adding a generic research phase.

## Risks And Mitigations

- Risk: HEAD already fixed some review items, so a wide sweep could rework
  stable behavior -> Mitigation: keep each task file-scoped and test only the
  residual axis it owns.
- Risk: recommendation changes can overfit to one output path -> Mitigation:
  verify both text and JSON outputs for `recommend`, `list`, and `matrix`.
- Risk: release smoke can fail for unrelated toolchain drift -> Mitigation:
  keep T-06 read-only unless the failure localizes to a specific release gate.

## Verification Plan

- Unit: task-scoped `bun test` commands listed above.
- E2E: `bun run validate:project-benchmarks`, `bun run smoke:dist`, and
  `bun run validate:release`.
- Other checks: `git diff --check` before the final verifier lane.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files, verification result, and any
  residual risk that remains after the release gate.
