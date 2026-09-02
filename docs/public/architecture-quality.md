# Architecture quality baseline

Measured snapshot for the public alpha. File size is not, by itself, a reason
to refactor.

## Snapshot

- Date: 2026-08-18.
- Runtime used for the measurement: Bun 1.3.14 on Linux x64.
- `cli/**` contained 406 TypeScript modules.

Largest production files at the snapshot:

| File | Lines |
| --- | ---: |
| `cli/services/workbench/lifecycle.ts` | 3,156 |
| `cli/commands/evolve.ts` | 2,335 |
| `cli/validate/scenario-execution.ts` | 1,942 |
| `cli/registry.ts` | 1,844 |
| `cli/validate/registry.ts` | 1,764 |

`cli/main.ts` is the composition root and has the highest direct fan-out.

## Cycles and complexity

One validation cycle was removed by extracting
`cli/validate/output-metrics.ts`. A later module scan found no remaining
cycles.

Oxlint's default complexity threshold of 20 still flags hotspot functions in
workbench lifecycle, scenario execution, and Evolution. Those are documented
refactor candidates, not hidden defects in the alpha contract.

## Checks and artifacts

The local release gate covers toolchain checks, tests, selected critical-
surface coverage, deterministic source checks, scanners, provenance, and
runtime smoke. Its local build outputs are validation evidence; the alpha does
not publish a compiled binary. Command timings on one developer host are
observational only.

Selected-surface coverage and whole-tree coverage are different metrics. Do
not treat them as interchangeable.

## Remaining work

- Decompose high-complexity functions only with behavior-preserving tests.
- Keep whole-tree and selected-surface coverage reported separately.
