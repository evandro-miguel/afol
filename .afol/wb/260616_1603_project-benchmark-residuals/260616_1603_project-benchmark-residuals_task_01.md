# Tasks: project-benchmark-residuals

## Execution Notes

- This session is planning-only until the execution work begins.
- Builder tasks should keep write scopes disjoint where possible.
- T-06 is verifier-only unless a release-gate defect is isolated to a specific
  release helper.

## State Board

| Task | State | Owner | Notes |
|------|-------|-------|-------|
| T-01 | pending | builder | `cli/services/project-benchmark/validate.ts`, `cli/services/project-benchmark/types.ts`, `.afol/adm/project-benchmarks/projects/**`, `cli/tests/project-benchmark-validation.test.ts` |
| T-02 | pending | builder | `cli/services/project-benchmark/generate.ts`, `cli/commands/project-benchmark.ts`, `cli/tests/project-benchmark-command.test.ts`, `.afol/data/project-benchmarks/**` |
| T-03 | pending | builder | `cli/services/project-benchmark/scoring.ts`, `cli/services/project-benchmark/render.ts`, `cli/tests/project-benchmark-command.test.ts` |
| T-04 | pending | builder | `cli/services/project-benchmark/validate.ts`, `cli/tests/project-benchmark-validation.test.ts`, `cli/tests/project-benchmark-command.test.ts` |
| T-05 | pending | builder | `cli/registry.ts`, `cli/help.ts`, `cli/tests/help.test.ts`, `cli/tests/registry.test.ts` |
| T-06 | pending | verifier | `git diff --check`, `bun run validate:project-benchmarks`, `bun run smoke:dist`, `bun run validate:release` |

## Task Detail

- T-01: enforce evidence-per-axis contract and source-reference validation.
- T-02: keep project-benchmark source under `.afol/adm/project-benchmarks`
  and generated output under `.afol/data/project-benchmarks`.
- T-03: make recommendations decision-safe and warning-aware.
- T-04: align schema/runtime validation and JSON failure reporting.
- T-05: keep `pb` discoverable and consistent in help/registry output.
- T-06: prove dist smoke and release validation still pass after the fixes.
