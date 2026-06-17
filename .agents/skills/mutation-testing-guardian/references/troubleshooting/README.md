---
description: Troubleshooting guide for noisy, slow, flaky, equivalent, uncovered, timed-out, or misconfigured mutation testing runs.
metadata:
  tags: "troubleshooting, mutation-testing, stryker, mutmut, ci"
---

# Troubleshooting

## Fast Diagnosis Table

<!-- markdownlint-disable MD013 -->

| Symptom | Likely cause | Action |
| --- | --- | --- |
| Normal tests fail before mutation | Invalid baseline | Stop, record failure, fix baseline or narrow scope |
| Mutation run takes too long | Scope too broad or command runner slow | Mutate changed files/hotspot only; enable incremental |
| Many `NoCoverage` mutants | Tests do not reach target | Add reach tests or reduce mutate scope |
| High coverage, many survivors | Weak oracle/assertions | Strengthen exact behavior assertions |
| Many equivalent mutants | Code has indistinguishable branches | Prove equivalence, rewrite for clarity, or ignore narrowly |
| Many compile errors | Type checker rejects invalid mutants | Record as noise; do not treat as weak tests |
| Timeouts | Infinite loop mutant or slow tests | Inspect one timeout; tune timeout or kill with boundary test |
| Flaky mutation results | Baseline flaky or test isolation poor | Fix flake before using score |
| Survivors in logs/config | Irrelevant scope | Exclude with explicit rationale |
| CI gate blocks too much legacy | Gate too broad too early | Move to diff/critical scope policy |

<!-- markdownlint-enable MD013 -->

## Baseline Is Red

Mutation testing is invalid when normal tests are unstable.

Actions:

1. Run the normal test command twice if flake is suspected.
2. Identify whether failure is related to the target.
3. If unrelated and user still wants progress, run only the nearest stable test
   and mark global baseline risk.
4. Do not add mutation CI gate.
5. Do not claim mutation score as trustworthy.

Report:

```md
Mutation skipped/limited because baseline command `...` failed before mutation.
Targeted validation used `...`; result `...`.
```

## Tool Not Installed

Do not install dependencies blindly.

Decision:

- If user asked for lasting setup, add tool using the repo package manager and
  commit config. If task is exploratory, prefer temporary/local execution only
  when acceptable. If package install is risky or unavailable, produce a plan
  and add normal characterization tests instead.

Respect lockfile owner:

- `bun.lock` or `bun.lockb`: use `bun add -d`; `pnpm-lock.yaml`: use `pnpm add
  -D`; `package-lock.json`: use `npm install --save-dev`; `uv.lock`: use `uv add
  --dev` when appropriate; Python without managed lockfile: ask or use existing
  environment policy.

## Stryker Problems

Common issues:

- wrong test runner for project; `mutate` glob includes tests or generated
  files; TypeScript checker cannot find `tsconfig.json`; Vitest config path
  differs; command runner starts watch mode; coverage analysis unsupported by
  runner.

Fixes:

- use `vitest run`, not watch mode; exclude `*.test.*`, `*.spec.*`, `__tests__`,
  stories, generated files; set `tsconfigFile`; set `coverageAnalysis` to `off`
  for command runner; narrow `mutate` to one target while debugging; read `bunx
  stryker --help` for installed syntax.

If Stryker mutates a file but no related tests run, choose between:

- add direct target tests; configure related test selection; use command runner
  with a narrow full command for that package.

## mutmut Problems

Common issues:

- mutating too much source; not finding tests; stack depth too high; cache/state
  stale; generated or migration files included.

Fixes:

- set `source_paths`, `only_mutate`, and `do_not_mutate`; run `python -m pytest`
  first; inspect `mutmut results` and `mutmut show <id>`; clear mutmut cache
  only when stale state is proven; use `mutate_only_covered_lines = true` when
  noisy.

## Cosmic Ray Problems

Common issues:

- session file stale; test command wrong; timeout too short/long; module path
  includes tests or generated files.

Fixes:

- recreate session after config changes; run the configured `test-command`
  manually; start with one module path; tune timeout based on normal test
  duration; use report output to triage, not raw database.

## Equivalent Mutants

A mutant is equivalent when syntax changes but observable behavior cannot
change.

Example: `a < b ? b : a` mutated to `a <= b ? b : a` can be equivalent when `a
=== b` returns the same value either way.

Process:

1. Try a boundary input that would distinguish behavior.
2. If none exists, explain why output is identical.
3. Consider rewriting code to avoid noisy expression if it improves clarity.
4. Ignore narrowly with a reason only when needed.

Never add meaningless tests to "kill" an equivalent mutant.

## NoCoverage Mutants

No coverage can mean:

- missing test for real behavior; mutate scope includes invalid file; code is
  dead; test runner selection excludes related tests.

Actions:

1. Verify whether target has callers.
2. Add reach test for critical path.
3. Exclude generated/irrelevant code.
4. Remove dead code when safe and in scope.
5. Fix test selection only if tool misconfigured.

## Timeout Mutants

Timeout can signal real missing guard:

- loop boundary changed; retry condition changed; async wait never resolves;
  polling interval changed.

Actions:

1. Inspect the timed-out mutation.
2. Run focused test with a shorter timeout if possible.
3. Add test for loop/retry/timeout boundary when behavior matters.
4. Increase mutation timeout only after ruling out missing behavior.

## Flaky Mutation Results

Flake sources:

- shared database/filesystem state; time/randomness; network calls; test order
  dependence; fake timers not restored; React async updates not awaited; Python
  monkeypatch not isolated.

Fix flake before trusting mutation score. If flake cannot be fixed inside scope,
do not gate CI.

## Survived Mutant Triage Questions

Ask:

```text
Does a test reach this line?
Does the mutation change state for any meaningful input?
Can the changed state reach a public output?
Does any assertion check that output?
Would a user, API consumer, database row, event, or caller observe this?
Is this domain-critical or incidental?
```

If answer is "domain-critical and observable", write or strengthen a test.

## Recovery Report

When blocked:

```md
## Mutation Testing Blocked
- Tool/scope:
- Blocking fact:
- Evidence:
- Risk:
- Safe next step:
```

Do not hide a blocked mutation run behind a normal test pass.
