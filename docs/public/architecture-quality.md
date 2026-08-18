# Architecture quality baseline

This report records the measured public-alpha baseline. It distinguishes
verified gates from observations and does not treat file size as proof that a
refactor is required.

## Snapshot

- Date: 2026-08-18.
- Baseline source commit: `5d2be613` on the local public-preparation branch.
- Public release candidate: `03afc0f`.
- Runtime: Bun 1.3.14 on Linux x64 under WSL2.

## Structure and change concentration

The `cli/**` tree contains 406 TypeScript modules and 186,423 lines including
tests and generated code. The largest production files at the baseline were:

| File | Lines |
| --- | ---: |
| `cli/services/workbench/lifecycle.ts` | 3,156 |
| `cli/commands/evolve.ts` | 2,335 |
| `cli/validate/scenario-execution.ts` | 1,942 |
| `cli/registry.ts` | 1,844 |
| `cli/validate/registry.ts` | 1,764 |

Across the latest 200 commits, the most frequently changed non-generated
production files were `cli/registry.ts` (30 commits),
`cli/services/workbench/lifecycle.ts` (24), `cli/commands/workbench.ts` (21),
`cli/commands/evolve.ts` (20), and `cli/validate/scenario-execution.ts` (18).

Madge reported `cli/main.ts` with 50 direct dependencies, consistent with its
composition-root role. The next highest dependency counts were Evolution's
service index (27), workbench lifecycle (21), and workbench/Evolution command
handlers (17 and 16).

## Cycles and complexity

The first dependency scan found one cycle:

```text
validate/scenario-execution.ts -> validate/hot-path-benchmark.ts
```

The shared output-size calculation moved to
`cli/validate/output-metrics.ts`. A repeated Madge scan processed 406 modules
and found zero circular dependencies. Focused tests passed 85/85 after the
change.

Oxlint's default complexity threshold of 20 found 17 functions above the
threshold in four selected hotspots. The observed maxima were 67 in workbench
lifecycle, 41 in scenario execution, and 32 in Evolution. These are explicit
refactor candidates, not hidden release claims; decomposing them remains open
until behavior-preserving slices and focused tests are defined.

## Static and test evidence

- Biome, Oxlint's configured rules, TypeScript, and Knip pass.
- Knip reports no known unused dependency or dead export in the public tree.
- The clean public release gate passes build, tests, critical-surface coverage,
  deterministic build, scanners, provenance, and smokes.
- A separate whole-tree Bun coverage run passed 2,035 tests with five skips and
  reported 61,509/75,384 lines (81.59%) and 3,910/4,348 functions (89.93%).
  This measurement includes loaded test-support modules and is not the same as
  the release gate's selected critical-surface coverage.

No independent duplication detector is part of the current toolchain, so this
report makes no quantified duplication claim.

## Artifact and command observations

The Linux x64 compiled binary measured 96,209,024 bytes (about 91.8 MiB). Five
local invocations of the compiled candidate produced these observational
medians:

| Command | Median | Maximum output |
| --- | ---: | ---: |
| `afol --help` | 48.98 ms | 2,201 bytes |
| `afol --version` | 46.35 ms | 19 bytes |
| `afol status` | 49.77 ms | 117 bytes |

These timings describe one WSL2 host and are not hosted-CI service-level
objectives. Output limits and correctness remain blocking; hosted timing is
observational unless a controlled runner profile is used.

## Remaining architecture work

- Decompose only the measured high-complexity functions with focused behavior
  and fault-injection tests.
- Add a maintained duplication measurement before making duplication claims.
- Re-run this baseline after material command or lifecycle refactors.
- Keep whole-tree and critical-surface coverage reported as separate metrics.
