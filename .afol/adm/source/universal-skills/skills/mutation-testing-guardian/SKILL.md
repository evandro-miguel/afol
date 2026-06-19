---
name: mutation-testing-guardian
description: Use when strengthening tests with selective mutation testing before or after risky changes, refactors, critical business-rule edits, authorization changes, validations, calculations, HTTP handlers, React state logic, or Python/TypeScript test quality work.
metadata:
  category: testing
  tags: "mutation-testing, testing, test-quality, stryker, mutmut, cosmic-ray, vitest, pytest, bun, react"
  triggers: "mutation testing, survived mutants, mutation score, stryker, mutmut, cosmic ray, oracle gap, strengthen tests, test quality, kill mutants, weak assertions, mutantes sobreviventes, testes fracos"
  references: "core, patterns, troubleshooting, gotchas"
  version: "2.0.0"
  updated_at: "2026-06-05T00:00:00Z"
  target_provider: universal
---

# Mutation Testing Guardian

Use this skill to test whether a test suite detects dangerous behavioral
changes. Coverage shows whether code ran. Mutation testing shows whether tests
would fail if the behavior changed.

## Activate For

- A user asks for mutation testing, Stryker, mutmut, Cosmic Ray, survived
  mutants, killing mutants, oracle gaps, or stronger tests. A refactor needs
  confidence before or after reducing complexity. Code touches money,
  authorization, validation, parsing, normalization, ranking, scoring, limits,
  discounts, permissions, HTTP handlers, React state, reducers, hooks, or
  central business rules. Coverage is high but assertions look weak. CI needs a
  selective gate for critical changed code.

## Do Not Activate For

- Trivial code, logs, telemetry without contract, generated files, config-only
  changes, thin wrappers, dead code slated for removal, old migrations, or
  purely visual UI without logic. Repositories whose normal tests are failing or
  flaky until baseline is understood. Whole-repo mutation as a first move unless
  the project is already configured for it.

## Fast Trigger Examples

Activate when the task sounds like:

- "run mutation testing on this change"; "coverage is high but tests feel weak";
  "kill survived mutants in pricing"; "Stryker reports survivors"; "mutmut found
  NoCoverage"; "protect this authorization refactor"; "strengthen tests before
  reducing complexity"; "make CI catch dangerous test gaps"; "which mutants are
  equivalent?"; "why did this mutant survive?".

## Dispatch

1. Read [Core Workflow](./references/core/README.md) for baseline, scoping,
   execution, mutant triage, acceptance thresholds, and reporting.
2. Read [Testing Patterns](./references/patterns/README.md) for behavior-focused
   tests, RIP diagnosis, TypeScript/Bun/React/Python tactics, and example
   configs.
3. Read [Troubleshooting](./references/troubleshooting/README.md) when mutation
   runs are slow, noisy, flaky, equivalent, uncovered, timed out, or blocked by
   tool setup.
4. Read [Gotchas](./gotchas.md) before accepting new tests or CI gates.

## Non-Negotiable Rules

- Baseline first. Detect the repo's package manager, runtime, and test runner;
  run only commands that exist for this project before trusting mutation
  results. Scope surgically: changed files, changed function/hook/service,
  hotspot, or critical module before package/repo-wide runs. Do not chase 100%
  blindly. Kill dangerous survivors, justify equivalents, and exclude irrelevant
  code with reasons. Kill mutants through observable behavior, not
  implementation details. Every survivor must be triaged before it becomes an
  action item. Mutation testing discovers weak tests; it does not define the
  correct business behavior.

## Quick Workflow

```text
discover tools -> run baseline -> choose narrow mutate scope -> dry run ->
execute mutation -> triage survivors -> improve tests -> rerun -> report
```

When used with complexity reduction:

```text
hotspot -> baseline -> mutation on hotspot -> strengthen tests ->
refactor small -> normal tests -> mutation same scope -> compare risk
```

## Execution Contract

Every useful mutation run answers:

```md
## Mutation Context
- Target file/function:
- Public behavior:
- Tool and runner:
- Normal test command:
- Mutate scope:
- Exclusions:
- Initial risk:
```

Mutation testing is expensive and noisy when scope is vague. The default scope
is one changed file, one changed function, one hook, one service, one handler,
or one critical domain module. Whole-repo mutation is a later maturity step.

## Runtime Routing

Select commands from local evidence:

| Evidence | Prefer |
| --- | --- |
| `bun.lock` or `bun.lockb` | `bun` scripts and `bunx` |
| `pnpm-lock.yaml` | `pnpm` scripts and `pnpm exec` |
| `package-lock.json` | `npm` scripts and `npx` |
| `yarn.lock` | `yarn` scripts |
| `pyproject.toml` plus `uv.lock` | `uv run` project commands when configured |
| `pyproject.toml` only | `python -m pytest` and installed Python tools |

Do not install or commit mutation tooling unless the user asked for durable
setup. For a one-off review, prefer temporary config, local package execution,
or an existing project task.

## Baseline Minimum

Do not trust mutation output until normal tests are understood:

- nearest normal test passes; typecheck passes when it is part of the normal
  gate; lint passes when it is part of the normal gate; flaky tests are either
  fixed, isolated, or recorded; clocks, randomness, environment variables,
  filesystem, database, cache, and network boundaries are deterministic enough
  for repeated test runs.

When flake is suspected, run the nearest normal test twice before mutation.

## Scope Policy

Start narrow:

1. changed function or hook;
2. changed file;
3. complexity hotspot;
4. critical module;
5. package;
6. whole repository only with proven runtime budget.

Exclude generated code, tests, fixtures, stories, migrations, vendor code, thin
wrappers, and logs without behavioral contract. Every exclusion that affects
critical code needs a reason.

## Survivor Triage

Classify before writing tests:

| Category | Meaning | Action |
| --- | --- | --- |
| No coverage | line not reached | add reach test or narrow scope |
| Weak assertion | output changed but test passed | assert public behavior |
| Boundary gap | wrong edge input | add boundary/table case |
| Propagation gap | state hidden | assert nearer output or prove equivalent |
| Equivalent | behavior cannot differ | document proof |
| Dangerous survivor | business/security drift can pass | fix before accepting |
| Tool noise | invalid mutant or timeout | document and isolate |

Use RIP: Reach, Infect, Propagate, Assert. Fix the missing link only.

## Test Quality Bar

Good mutant-killing tests:

- assert observable behavior; use the smallest meaningful input; fail on the
  mutant and pass on the original code; avoid private-call assertions; avoid
  broad snapshots as the only oracle; do not duplicate implementation logic in
  expected values.

Prefer table tests for conditions, boundary tests for comparisons, user-visible
tests for React, and public API or domain assertions for handlers and services.

## CI Gate Rules

Do not introduce a strict global gate first. Start with report-only or changed
critical scope. A blocking gate is acceptable only when runtime is bounded,
baseline is stable, ignored mutants are reviewed, and the policy is explicit.

Good first CI policies:

- report mutation result for critical changed files; block only new dangerous
  survivors; require rationale for exclusions; keep full mutation scheduled or
  manual until runtime is proven.

Bad first CI policies:

- whole-repo hard threshold on legacy code; blocking flaky mutation jobs;
  score-only gates that ignore survivor risk; permanent ignores without review.

## Reviewer Checklist

Before accepting test changes, inspect:

| Check | Pass condition |
| --- | --- |
| reach | test executes the mutated branch or line |
| infect | input makes the mutant change state or output |
| propagate | changed state reaches public output |
| assert | assertion would fail on the mutant |
| behavior | expected value comes from domain contract, not copied code |
| isolation | mocks do not replace the behavior under test |
| determinism | time, randomness, IO, env, and async are controlled |
| scope | mutation run targets changed or critical code only |
| exclusions | ignored files or mutants have a reason |
| report | survivors are categorized, not just counted |

Reject tests that:

- only increase coverage without killing relevant mutants; assert implementation
  call order instead of observable behavior; use snapshots as the only oracle
  for logic; duplicate the production algorithm in the expected value; hide
  flake with retries instead of controlling the cause; chase equivalent mutants
  without a proof threshold.

## Collaboration With Other Skills

Use this skill with:

- `reducao-segura-complexidade-ciclomatica` before and after risky refactors;
  `typescript-skill` for type-safe test fixtures and discriminated unions;
  `python-testing` when pytest fixtures or parametrization need depth;
  `vitest-skill` when Vitest configuration or runner behavior is the blocker;
  `playwright-skill` when UI mutants require browser-visible assertions.

Keep this skill focused on oracle quality. Do not turn it into general testing
cleanup unless the survivor analysis proves the tests are weak.

## Acceptance Bar

Accept the change when:

- no critical survivor remains untriaged; new tests assert public behavior;
  mutation score or survivor profile does not get worse for critical scope;
  equivalents and ignored mutants have explicit rationale; CI policy, if added,
  starts narrow and avoids unstable global gates.

## Final Response Shape

Report:

- scope and tool used; baseline commands and status; initial and final mutation
  result; relevant survivors killed or triaged; tests added/changed;
  ignored/equivalent mutants and rationale; residual risk and whether CI gate
  changed.
