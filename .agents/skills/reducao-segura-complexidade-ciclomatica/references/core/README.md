---
description: Mandatory workflow, thresholds, hotspot ranking, behavior characterization, validation, and reporting for safe complexity reduction.
metadata:
  tags: "complexity, workflow, thresholds, validation, refactoring"
---

# Core Workflow

## Table Of Contents

- [Mission](#mission) [Phase 0: Scope And Safety](#phase-0-scope-and-safety)
  [Phase 1: Discover Project Facts](#phase-1-discover-project-facts) [Phase 2:
  Baseline Validation](#phase-2-baseline-validation) [Phase 3: Measure Or
  Estimate Complexity](#phase-3-measure-or-estimate-complexity)
  [Thresholds](#thresholds) [Phase 4: Rank Hotspots](#phase-4-rank-hotspots)
  [Phase 5: Characterize Behavior](#phase-5-characterize-behavior) [Phase 6:
  Patch Small](#phase-6-patch-small) [Phase 7: Validate](#phase-7-validate)
  [Phase 8: Final Report](#phase-8-final-report) [Final
  Criterion](#final-criterion)

## Mission

Reduce accidental complexity while preserving behavior. Optimize for code that
is easier to reason about, test, and change. Do not optimize only for a metric.

Complexity to consider:

- cyclomatic paths; cognitive load from nesting and non-linear reading;
  TypeScript type complexity and unsafe narrowing; React state/effect
  complexity; IO and side-effect coupling in Bun/Python handlers; duplicated
  domain rules; brittle tests that block safe refactoring.

## Phase 0: Scope And Safety

Before editing:

1. Identify the real stack and package manager from local files.
2. Read official scripts in `package.json`, `pyproject.toml`, `justfile`,
   `Makefile`, or repo docs.
3. Check worktree state and avoid unrelated dirty files.
4. Define one target hotspot or a small group of tightly coupled functions.
5. Decide whether this is behavior-preserving refactor or intentional behavior
   change. If behavior change is requested, separate it from refactor.

Never start with:

- repository-wide rewrite; formatting-only churn across unrelated files;
  lockfile changes without dependency intent; public contract changes without
  explicit migration; many hotspots in one patch; refactor without a validation
  plan.

## Phase 1: Discover Project Facts

Read only what affects the target.

For TypeScript, Bun, or React, inspect when present:

- `package.json`, `bun.lock`, `bun.lockb`; `tsconfig.json`, `bunfig.toml`;
  `eslint.config.*`, `.eslintrc*`, `biome.json`; `vite.config.*`,
  `next.config.*`, route configs; target source, tests, schemas, handlers,
  hooks, and callers.

For Python, inspect when present:

- `pyproject.toml`, `requirements*.txt`, `setup.cfg`; `tox.ini`, `pytest.ini`,
  `ruff.toml`, `mypy.ini`, `pyrightconfig.json`; target source, tests, routes,
  services, and callers.

Record mentally or in the response:

```md
## Environment
- Runtime:
- Language:
- Frameworks:
- Test runner:
- Type/lint tools:
- Target:
```

## Phase 2: Baseline Validation

Run existing scripts first. Do not invent a new tool when the repo already has
an official command.

Choose commands from project evidence:

| Evidence | Prefer |
| --- | --- |
| `bun.lock` or `bun.lockb` | `bun` scripts and `bunx` |
| `pnpm-lock.yaml` | `pnpm` scripts and `pnpm exec` |
| `package-lock.json` | `npm` scripts and `npx` |
| `yarn.lock` | `yarn` scripts |
| `pyproject.toml` plus `uv.lock` | `uv run` project commands when configured |
| `pyproject.toml` no wrapper | `pytest`, `ruff`, `mypy`, `pyright` |

Use a target variable for narrow probes when the tool supports file scope:

```bash
TARGET=src/domain/pricing.ts
```

Common TypeScript/Bun/React candidates when configured:

```bash
bun test
bun test --coverage
bun run test
bun run test:coverage
bun run typecheck
bun run lint
bun run build
bunx tsc --noEmit
bunx eslint .
bunx biome check .
```

Common Python candidates when configured:

```bash
python -m pytest
python -m pytest --cov
ruff check .
mypy .
pyright
radon cc -s -a "$TARGET"
radon mi -s .
```

If baseline already fails, do not broaden the task. Record failures and accept
only changes that do not make them worse.

```md
## Baseline
| Command | Status | Note |
|---|---|---|
```

## Phase 3: Measure Or Estimate Complexity

Use project tools when configured. If unavailable, estimate manually and say it
is an estimate.

TypeScript/JavaScript checks when configured:

```bash
bunx eslint . --max-warnings=0
bunx eslint "$TARGET" --rule 'complexity: ["warn", 10]'
bunx biome check .
```

Look for rules such as:

- `complexity`, `max-depth`, `max-lines-per-function`; `max-statements`,
  `max-params`, `no-else-return`; `@typescript-eslint/no-explicit-any`;
  `@typescript-eslint/no-unsafe-assignment`;
  `@typescript-eslint/switch-exhaustiveness-check`;
  `react-hooks/rules-of-hooks`; `react-hooks/exhaustive-deps`.

Python checks:

```bash
radon cc -s -a "$TARGET"
radon cc -s -j "$TARGET" > /tmp/radon-cc.json
radon mi -s .
ruff check "$TARGET" --select C901
```

Before using optional tools, confirm they exist locally:

```bash
command -v radon
command -v ruff
```

For package tools, prefer `bunx <tool> --version`, `pnpm exec <tool> --version`,
`npx <tool> --version`, or the repo task that already wraps them.

## Thresholds

Cyclomatic complexity per function:

| Score | Class | Default action |
| ---: | --- | --- |
| 1-5 | Simple | Usually leave alone. |
| 6-10 | Acceptable | Refactor only if there is pain. |
| 11-15 | Attention | Refactor if change-prone, buggy, or weakly tested. |
| 16-20 | High | Treat as likely hotspot; add tests first. |
| 21-30 | Critical | Use small patches and strong characterization. |
| 31+ | Emergency | Do not mass-refactor; first isolate and characterize. |

Cognitive complexity:

| Score | Class | Default action |
| ---: | --- | --- |
| 1-10 | Low | Usually fine. |
| 11-15 | Moderate | Review names, nesting, duplication. |
| 16-25 | High | Refactor with tests. |
| 26+ | Very high | Split responsibilities and states. |

Heuristics that can override a moderate score:

- more than 80 lines; more than four primitive parameters; more than two nesting
  levels; more than two responsibilities; more than one side-effect category;
  duplicated business rules; difficult tests that require heavy global mocks;
  public contract or high business criticality.

A high score can be acceptable when the code is an isolated pure algorithm,
explicit decision table, performance-critical path with evidence, or stable
domain rule with strong tests. State the justification.

## Phase 4: Rank Hotspots

Do not choose only the biggest number. Rank by risk and return:

```text
priority = metric_severity
         + change_frequency
         + business_criticality
         + low_coverage
         + side_effect_count
         + duplication
         + debugging_cost
         - isolation
         - proven_stability
```

Use this table for non-trivial analysis:

| Priority | File | Fn/module | Type | Score | Cause | Risk | Gain |
| --- | --- | --- | --- | ---: | --- | --- | --- |

Complexity types:

- cyclomatic; cognitive; TypeScript types; React state or effects; Bun/Python
  handler; IO and side effects; duplication; async flow; error handling; tests;
  architecture boundary.

## Phase 5: Characterize Behavior

Before touching a relevant hotspot, answer:

```md
## Behavior Contract
- Inputs:
- Return/output:
- Errors thrown or handled:
- Side effects:
- External dependencies:
- Invariants:
- Edge cases:
- Existing tests:
- Missing tests:
```

Add tests first when behavior is not covered enough. Good options:

- characterization tests for legacy behavior; table tests for branch
  combinations; property/invariant tests when a general rule is clear;
  integration tests for database/API/filesystem contracts; React user-visible
  interaction tests; hook tests when state logic was extracted; regression tests
  for known bugs.

## Phase 6: Patch Small

Preferred order:

1. Strengthen tests.
2. Extract a pure function without behavior change.
3. Flatten nesting with guard clauses.
4. Separate validation, transformation, IO, and response shaping.
5. Remove duplicated domain rules.
6. Centralize error/config/schema only when it reduces real duplication.
7. Consider a larger structure change only after the smaller step is green.

Patch discipline:

- Keep names domain-specific. Preserve public APIs unless migration is explicit.
  Prefer local helpers over new shared utilities until reuse is proven. Keep
  abstractions close to the call site unless multiple modules already need them.
  Re-run narrow checks after each meaningful change.

## Phase 7: Validate

After each patch:

- run the closest test; run relevant typecheck/lint; run broader suite when risk
  warrants; compare coverage or complexity output when available; inspect diff
  manually for behavior drift.

Report validation as:

```md
## Patch Validation
| Command | Before | After | Result |
|---|---|---|---|
```

## Phase 8: Final Report

Use this shape:

```md
# Complexity Reduction Report

## Reduced
- Before:
- After:
- Gain:

## Files Changed
- ...

## Behavior Preserved
- ...

## Tests Added/Changed
- ...

## Commands Run
| Command | Result |
|---|---|

## Remaining Risks
- ...

## Next Hotspots
- ...
```

## Final Criterion

The change is successful when the target code has fewer meaningful paths or
clearer localized paths, keeps behavior protected, and leaves future agents with
a simpler execution surface.
