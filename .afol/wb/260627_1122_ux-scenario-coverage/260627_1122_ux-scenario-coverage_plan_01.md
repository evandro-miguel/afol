# Plan: ux-scenario-coverage

- Created by native CLI workbench lifecycle.

## Native command metadata
- feature_id: F-19
- parent_spec: 260423_1605_controlled-runtime-flow-benchmarks_spec_01
- task: Document per-tool AFOL benchmark journeys and UX flow registry contract

## Execution Plan

- T-01: Document per-tool AFOL benchmark journeys and UX flow registry contract
- Keep edits scoped to the task and repository rules.
- Record evidence before marking the task done.

## Planned Files

- `.afol/adm/specs/260627_1122_afol-tool-scenario-coverage-and-ux-registry_spec-child_01.md`
- `.afol/adm/benchmarks/afol-tool-scenario-coverage-plan.md`
- `.afol/adm/rules/RULE-012-user-journey-coverage.md`
- `.afol/adm/rules/README.md`
- `.afol/adm/rules/index.json`
- `docs/standards/user-journey-registry.md`
- `docs/standards/README.md`
- `docs/templates/ux-journey.md`
- `docs/templates/AGENTS_TEMPLATE.md`
- `src/project-template/AGENTS.md`
- `src/project-template/docs/templates/ux-journey.md`
- `src/project-template/.afol/adm/rules/RULE-012-user-journey-coverage.md`
- `src/project-template/.afol/adm/rules/README.md`
- `src/project-template/.afol/adm/rules/index.json`

## Known Findings

- `afol maintenance weekly --dry-run` reports due review areas: rules, skills,
  docs, commands, memory, library, and organization.
- Existing benchmark specs use `F-19`, while the current roadmap `F-19` is
  configuration rehome. This task records the drift and keeps the new coverage
  plan linked to the validation/benchmark direction instead of widening scope.

## Validation

- Run the command named in the task or governing brief.
- Capture the validation result in the evidence ledger.

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
