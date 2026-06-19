---
description: Mandatory mutation testing workflow, scope selection, mutant triage, quality thresholds, CI adoption, and reporting.
metadata:
  tags: "mutation-testing, workflow, triage, ci, quality-gate"
---

# Core Workflow

## Table Of Contents

- [Purpose](#purpose) [Phase 0: Discover Project](#phase-0-discover-project)
  [Phase 1: Stabilize Baseline](#phase-1-stabilize-baseline) [Phase 2: Choose
  Surgical Scope](#phase-2-choose-surgical-scope) [Phase 3: Configure Or Reuse
  Tool](#phase-3-configure-or-reuse-tool) [Phase 4: Dry Run](#phase-4-dry-run)
  [Phase 5: Execute Mutation](#phase-5-execute-mutation) [Phase 6: Triage
  Survivors](#phase-6-triage-survivors) [Phase 7: Improve
  Tests](#phase-7-improve-tests) [Phase 8: Re-run And
  Compare](#phase-8-re-run-and-compare) [Score Guidance By
  Risk](#score-guidance-by-risk) [Oracle Gap](#oracle-gap) [CI
  Adoption](#ci-adoption) [Final Report](#final-report)

## Purpose

Mutation testing answers:

```text
If a developer changes an operator, condition, return, default value, branch,
validation, or business rule, would the tests notice?
```

Use it to find weak or missing assertions. Do not use it as a vanity metric.

## Phase 0: Discover Project

Before running anything, inspect:

- `package.json`, `bunfig.toml`, `tsconfig.json`; `vitest.config.*`,
  `jest.config.*`, `stryker.config.*`; `pyproject.toml`, `setup.cfg`, `tox.ini`,
  `pytest.ini`; existing `mutmut`, `cosmic-ray`, coverage, lint, and CI config;
  target source, tests, callers, route contracts, schemas, and public outputs.

Determine:

```md
## Mutation Context
- Runtime:
- Test runner:
- Mutation tool:
- Critical target:
- Existing coverage:
- Existing config:
```

## Phase 1: Stabilize Baseline

Never trust mutation results when normal tests are red or flaky.

Select commands from project evidence. Do not run `bun`, `pnpm`, `npm`,
`pytest`, `mypy`, or `pyright` just because this skill lists them. Prefer
scripts and tools that are present in the repo.

Package/runtime routing:

| Evidence | Prefer |
| --- | --- |
| `bun.lock` or `bun.lockb` | `bun` scripts and `bunx` |
| `pnpm-lock.yaml` | `pnpm` scripts and `pnpm exec` |
| `package-lock.json` | `npm` scripts and `npx` |
| `yarn.lock` | `yarn` scripts |
| `pyproject.toml` with pytest config | `python -m pytest` or project task |
| `uv.lock` | `uv run` project commands when configured |

TypeScript/Bun candidates when supported:

```bash
bun test
bun run test
bun run typecheck
bun run lint
bun run build
```

Vitest candidates:

```bash
bunx vitest run
bunx vitest run --coverage
```

Python candidates:

```bash
python -m pytest
python -m pytest --cov
ruff check .
mypy .
pyright
```

Minimum baseline:

- tests pass; typecheck passes when applicable; lint passes when used as a
  normal gate; environment is reproducible; worktree diff is understood; known
  failures are recorded.

Determinism checklist before mutation runs:

- freeze or control clocks where tests depend on time; seed randomness or remove
  random assertions; isolate database, filesystem, cache, and environment
  variables; disable network access except at explicit mocked boundaries;
  restore fake timers, monkeypatches, spies, and globals; avoid watch mode and
  interactive runners; run the nearest normal test twice when flake is
  suspected.

If baseline fails, stop or narrow to a target that can still be validated. Do
not interpret mutation score from an unstable suite.

## Phase 2: Choose Surgical Scope

Default scope priority:

1. changed files;
2. changed function, hook, service, or handler;
3. complexity hotspot;
4. critical module;
5. package;
6. whole repository only when already configured and affordable.

High-value targets:

- authorization, permissions, authentication; money, price, tax, discount,
  limit, scoring, ranking; parsing, validation, normalization; state machines,
  reducers, React hooks with real logic; HTTP handlers with non-trivial
  status/error behavior; utilities used by many modules; code about to be
  refactored.

Low-value or excluded targets:

- generated files; tests, fixtures, stories; logs and telemetry without domain
  contract; config files; wrappers with no rule; old migrations; dead code
  scheduled for deletion; third-party/vendor code.

## Phase 3: Configure Or Reuse Tool

Prefer existing project configuration. If none exists, use the smallest local
config possible and avoid committing tool setup unless the user asked for a
lasting gate.

Common tools:

| Stack | Primary tool | Notes |
| --- | --- | --- |
| TypeScript + Vitest | StrykerJS | Best supported path for TS mutation. |
| Bun test only | StrykerJS command runner | Useful, but less precise. |
| React | StrykerJS + Vitest/RTL | Assert visible behavior and interactions. |
| Python + pytest | mutmut | Simple local workflow. |
| Python advanced | Cosmic Ray | More configurable, more setup. |

## Phase 4: Dry Run

Before a long mutation run:

- run the selected normal test command; run the mutation tool help/config
  validation if available; mutate one file or one small glob; confirm reports
  are produced; check runtime and timeout behavior.

Examples, adjusted to installed tool syntax:

```bash
bunx stryker --help
bunx stryker run --configFile stryker.config.json --mutate "src/domain/pricing.ts"
mutmut run --paths-to-mutate src/domain/pricing.py
cosmic-ray init cosmic-ray.toml session.sqlite
```

The Stryker config filename may be `stryker.config.json`, `stryker.config.ts`,
`stryker.conf.json`, or project-specific. Use existing project config first. If
command syntax differs, read the local `--help` and prefer the installed version
over this example.

## Phase 5: Execute Mutation

Run in the narrow target scope. Preserve raw result summary for reporting:

- mutation score; killed; survived; no coverage; timeout; compile/runtime
  errors; ignored; files/functions affected.

Do not immediately write tests for every survivor. Triage first.

## Phase 6: Triage Survivors

Every survivor gets a category:

| Category | Meaning | Action |
| --- | --- | --- |
| No coverage | Test never reaches code | Add reach test or narrow scope |
| Weak assertion | Test reaches but misses output | Strengthen assertion |
| Bad input | Test misses boundary that infects state | Add edge/table case |
| Propagation gap | State changes but output does not | Test nearer output |
| Equivalent | Syntax changes but behavior cannot change | Prove and document |
| Dead code | No real caller or path | Remove or exclude with evidence |
| Irrelevant | Mutated detail is not domain contract | Exclude with reason |
| Invalid/tool noise | Invalid mutant or tool issue | Document as noise |
| Dangerous survivor | Silent critical drift | Repair tests before accepting |

Use RIP:

```text
Reach: test executes mutated line.
Infect: mutation changes internal state.
Propagate: difference reaches observable output.
Assert: test checks that output.
```

If one link fails, fix that link only.

## Phase 7: Improve Tests

Prefer behavior assertions:

- public return value; HTTP status/body/header; expected thrown error; persisted
  state; emitted event; visible DOM text/state; external contract at a mocked
  boundary; domain invariant.

Avoid:

- assertions on private function call order; snapshots as the only oracle for
  logic; over-mocking the unit under test; duplicating implementation logic in
  the expected value; `toBeTruthy()` when exact output matters.

## Phase 8: Re-run And Compare

Re-run the same mutation scope after test changes. Compare:

- score before/after; count of dangerous survivors before/after; `NoCoverage`
  before/after; equivalent/ignored mutants and rationale; runtime stability.

For refactors, run mutation before and after when feasible. A lower complexity
score is not enough if mutation risk worsens.

## Score Guidance By Risk

| Scope | Target | Acceptance rule |
| --- | ---: | --- |
| Money, auth, permissions | 90%+ | Zero critical survivor without rationale. |
| Central business rule | 85%+ | Survivors triaged. |
| Important HTTP handler | 80%+ | Main contracts protected. |
| React state logic | 80%+ | Critical visible states covered. |
| Widely used pure utility | 85%+ | Edges and invariants covered. |
| Legacy without tests | Baseline first | Prevent regression first. |
| Logs, thin adapters, config | No rigid target | Usually exclude or justify. |

Score is secondary to survivor risk. A 92% score with a survivor in payment
logic can be worse than 78% with survivors in logs.

## Oracle Gap

Oracle gap means coverage is high but mutation score is low.

Interpretation:

| Coverage | Mutation | Meaning |
| --- | --- | --- |
| High | High | Tests are probably meaningful. |
| Low | Low | Need both reach and assertions. |
| High | Low | Tests execute code but do not verify behavior. |
| Low | High | Scope may be too small or metric misleading. |

If oracle gap is high, strengthen assertions before adding more superficial
tests.

## CI Adoption

Do not start with a strict global gate in existing projects.

Maturity levels:

| Level | Policy |
| --- | --- |
| 1 experimental | Local hotspot runs, reports only. |
| 2 PR critical | Changed critical files only; block dangerous new survivors. |
| 3 protected module | Module thresholds and reviewed ignores. |
| 4 continuous quality | Diff mutation plus scheduled full run. |

Operational guardrails for CI:

- set an explicit job timeout; mutate changed or critical scope, not the whole
  repo by default; archive reports without blocking on first measurement;
  require human review before turning an informational gate into a blocking
  threshold; allow legacy modules to start with "no new critical survivors"
  before score thresholds; keep whole-repo mutation scheduled or manual unless
  runtime is proven acceptable.

Block CI on:

- baseline failure; score below target for protected scope; new critical
  survivor without rationale; `NoCoverage` in critical new code; exclusion
  without reason; snapshot-only protection for critical rule; tests that
  over-mock the behavior under test.

Do not block automatically on:

- equivalent mutant with documented proof; irrelevant log/telemetry mutant;
  compile errors from invalid mutants; first measurement of legacy scope;
  timeout understood as tool/runtime noise and not critical.

## Final Report

Use this shape:

```md
# Mutation Testing Report

## Scope
- Mutated:
- Excluded:
- Reason:

## Baseline
| Command | Result |
|---|---|

## Configuration
- Tool:
- Test runner:
- Coverage mode:
- Timeout/incremental:

## Initial Result
- Score:
- Killed:
- Survived:
- No coverage:
- Timeout/errors:

## Survivor Triage
| Mutant | File/function | Category | Risk | Action |
|---|---|---|---|---|

## Tests Changed
- ...

## Final Result
- Score:
- Survived critical:
- Remaining rationale:

## Ignored Or Equivalent
- ...

## Residual Risk
- ...
```
