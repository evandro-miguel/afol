# Plan: scenario-coverage-gate

- Created by native CLI workbench lifecycle.

## Native command metadata
- feature_id: F-11
- parent_spec: 260521_0110_validation-ci-and-benchmarks_spec_01
- task: Implement registry-to-scenario coverage gate for AFOL tool benchmark journeys

## Execution Plan

- T-01: Implement registry-to-scenario coverage gate for AFOL tool benchmark journeys
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Planned Files

- `cli/validate/types.ts`
- `cli/validate/registry.ts`
- `cli/tests/validate-internals.test.ts`
- `.afol/adm/benchmarks/afol-tool-scenario-coverage-plan.md`
- `docs/standards/user-journey-registry.md`
- `.afol/data/benchmarks/catalog/registry.json`
- `.afol/data/benchmarks/catalog/README.md`
- `.afol/data/benchmarks/catalog/scenarios/runtime-live-agent/live-governed-task.json`
- `.afol/data/benchmarks/catalog/scenarios/runtime-live-agent/live-maintenance-cadence.json`
- `src/project-template/.afol/data/benchmarks/catalog/registry.json`
- `src/project-template/.afol/data/benchmarks/catalog/README.md`
- `src/project-template/.afol/data/benchmarks/catalog/scenarios/runtime-live-agent/live-governed-task.json`
- `src/project-template/.afol/data/benchmarks/catalog/scenarios/runtime-live-agent/live-maintenance-cadence.json`
- `cli/generated/template.ts`

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
