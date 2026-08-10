---
name: reducao-segura-complexidade-ciclomatica
description: Use when reducing cyclomatic, cognitive, type, state, or control-flow complexity in TypeScript, Bun, React, or Python code while preserving observable behavior with tests, small patches, and explicit validation.
metadata:
  category: technique
  tags: "complexity, refactoring, cyclomatic-complexity, cognitive-complexity, typescript, bun, react, python"
  triggers: "cyclomatic complexity, cognitive complexity, refactor hotspot, reduce complexity, nested conditionals, simplify function, safe refactoring, complexity budget, branch explosion, boolean soup, complexidade ciclomatica, complexidade cognitiva, reduzir complexidade, refatoracao segura"
  references: "core, patterns, troubleshooting, gotchas"
  version: "1.0.2"
  updated_at: "2026-07-18T14:18:13Z"
  target_provider: universal
---

# Safe Cyclomatic Complexity Reduction

Use this skill to simplify code without changing observable behavior. Treat
cyclomatic complexity as a signal, not the goal. The real goal is fewer mental
paths, clearer domain boundaries, fewer impossible states, and stronger tests.

## Activate For

- A user asks to reduce cyclomatic complexity, cognitive complexity, nesting,
  branch count, boolean soup, state explosion, handler complexity, type
  complexity, or refactor hotspots. A linter or metric flags `complexity`,
  `C901`, `max-depth`, `max-lines-per-function`, `max-statements`, `max-params`,
  unsafe TypeScript, React hook dependency problems, or long handlers. A risky
  refactor needs characterization tests and small behavior-preserving steps.
  TypeScript/Bun/React/Python code mixes decisions, validation, transformation,
  IO, errors, and public response shaping in one place.

If the user only asks to detect duplicate logic, UX effort, runtime cost, or
bundle cost without changing code, use `quality-signal-audit` first. Return here
only when complexity reduction is the selected owner.

## Do Not Activate For

- Pure formatting, naming-only cleanup, broad architecture redesign, or a full
  rewrite request. Trivial functions with no real maintenance pain. Domain
  complexity that is essential and already explicit, isolated, tested, and
  stable.

## Fast Trigger Examples

Activate when the task sounds like:

- "this function is too complex"; "reduce cyclomatic complexity without changing
  behavior"; "simplify this handler but keep tests green"; "Sonar, ESLint, or
  Ruff flags this branch count"; "split this React hook state logic safely";
  "remove nested conditionals from this service"; "make this TypeScript union
  easier to reason about"; "refactor before adding a risky rule".

## Dispatch

1. Read [Core Workflow](./references/core/README.md) for the mandatory execution
   path, metric thresholds, hotspot ranking, validation, and report format.
2. Read [Refactoring Patterns](./references/patterns/README.md) when you need
   concrete transformations for nesting, switches, booleans, TypeScript types,
   Bun handlers, React state, or Python functions.
3. Read [Troubleshooting](./references/troubleshooting/README.md) when
   validation fails, behavior is unclear, complexity moves instead of shrinking,
   or the metric conflicts with code clarity.
4. Read [Gotchas](./gotchas.md) before accepting the patch; it lists anti-gaming
   rules and stop conditions.

## Non-Negotiable Rules

- Baseline first. Know whether tests, typecheck, lint, and build pass before
  editing. Refactor one hotspot at a time. No mass rewrite. No global formatting
  unless already required by the touched file. Preserve observable behavior
  unless the user explicitly requests a behavior change. Strengthen tests before
  refactoring when current tests do not characterize the hotspot. Separate
  decision logic from side effects before extracting fancy abstractions. Never
  hide risk with `any`, unsafe casts, `!`, weak mocks, or snapshots that do not
  assert behavior. If complexity score falls but coupling, duplication, states,
  or test brittleness increases, the refactor failed.

## Quick Workflow

```text
discover project -> baseline -> measure/estimate -> rank hotspots ->
characterize behavior -> patch small -> validate -> report risk
```

Default patch order:

1. Add or strengthen characterization tests.
2. Extract pure decision logic.
3. Flatten guard clauses and remove avoidable nesting.
4. Split validation, transformation, IO, and response formatting.
5. Replace duplicated rules with named domain concepts.
6. Re-run the narrowest relevant checks, then broader checks if risk warrants.

## Execution Contract

Use the smallest useful workflow that still proves behavior. A good run has
these artifacts, even if they are only summarized in the final response:

```md
## Target
- File/function:
- Callers or public entry point:
- Complexity symptom:
- Behavior contract:
- Current tests:
- Proposed validation:
```

Start with one target. A target can be one function, hook, handler, reducer,
service method, or tightly coupled cluster. Avoid mixing unrelated hotspots in
one patch because each hotspot needs its own behavior proof.

## Tool And Runtime Routing

Infer commands from repo files before running them:

| Evidence | Prefer |
| --- | --- |
| `bun.lock` or `bun.lockb` | `bun` scripts and `bunx` |
| `pnpm-lock.yaml` | `pnpm` scripts and `pnpm exec` |
| `package-lock.json` | `npm` scripts and `npx` |
| `yarn.lock` | `yarn` scripts |
| `pyproject.toml` | `python -m`, `uv run`, project tools |
| `justfile` or `Makefile` | project task when it is the documented gate |

Do not install metric tools just to satisfy this skill unless user intent allows
dependency changes. If no tool exists, estimate complexity manually and say so.

## Narrow Validation First

Prefer the closest proof before a broad run:

- test file for the changed function; typecheck for the touched package; lint
  for the touched file if the tool supports it; route/component test for the
  public behavior; broader suite only after narrow checks pass or when risk
  demands it.

For Python metric probes, write temporary machine output outside the repo unless
the project already tracks reports:

```bash
radon cc -s -j "$TARGET" > /tmp/radon-cc.json
```

## Target Selection

Do not rank by complexity number alone. Choose the target with the best risk and
return balance:

| Signal | Why it matters |
| --- | --- |
| high complexity score | many paths to reason about |
| frequent edits | future changes keep paying the cost |
| weak or missing tests | refactor risk is higher |
| public contract | behavior drift is more expensive |
| side effects mixed with decisions | tests need more setup and mocks |
| duplicated domain rule | bug fixes can diverge |
| unclear ownership | extraction may create the wrong abstraction |

Leave a complex function alone when it is a stable pure algorithm with strong
tests, clear names, and no current change pressure.

## Safe Transformation Ladder

Move only one rung at a time:

1. Name a predicate.
2. Add a guard clause.
3. Extract a pure calculation or classifier.
4. Introduce an exhaustive decision table or discriminated union.
5. Split thin shell from pure core.
6. Consolidate duplicated domain rule.
7. Introduce a strategy object or state machine only when simpler shapes fail.

After each rung, re-run the closest check. If the next rung requires broad
architecture changes, stop and report the boundary instead of forcing it.

## TypeScript And React Guardrails

- Keep `unknown` at IO boundaries and narrow before domain code. Prefer
  discriminated unions to parallel booleans. Use `satisfies` for exhaustive
  maps. Do not replace complex runtime behavior with type cleverness. In React,
  derive state instead of storing it when possible. Prefer reducers or state
  machines when transitions matter. Test visible behavior and user interactions
  unless the hook itself is the public unit.

## Python Guardrails

- Prefer guard clauses, small pure functions, and table tests. Keep dictionary
  dispatch total: use a default error path for unknown keys. Do not hide ordered
  fallthrough in dispatch maps. Keep IO at the boundary and business decisions
  in testable functions. Use `pytest.mark.parametrize` for branch matrices.

## Risk Limits

Stop and report instead of continuing when:

- baseline is red and the target cannot be isolated; behavior contract is
  unknown and no characterization test can be written; a public API change
  becomes necessary; the refactor needs new shared architecture; the code is
  generated or owned by external tooling; complexity goes down only by moving
  confusing code elsewhere.

## Reviewer Checklist

Before final answer, inspect the diff against this checklist:

| Check | Pass condition |
| --- | --- |
| behavior | public behavior is covered or intentional change is named |
| scope | patch touches one hotspot or one coherent cluster |
| names | helpers use domain language, not vague mechanical labels |
| control flow | nesting and branch count are genuinely easier to read |
| types | TypeScript narrowing is safer, not hidden behind casts |
| state | React or domain state has fewer impossible combinations |
| IO | side effects remain at boundaries where possible |
| errors | error mapping is explicit and tested at public boundary |
| tests | tests assert behavior, not private call order |
| metrics | before/after metric or estimate is reported honestly |

Reject the patch when any of these appear:

- a new shared utility with only one caller and no stable domain name; a
  decision map that can throw on an unknown value without an explicit error; a
  helper that only wraps one branch and hides the actual rule; `any`, non-null
  assertion, or broad cast added to quiet TypeScript; test snapshots replacing
  exact assertions for business logic; broad reformatting that makes review
  harder.

## Collaboration With Other Skills

Use this skill with:

- `typescript-skill` for narrowing, discriminated unions, and type-safe
  refactors; `qa-fix` when a bug reproduction already exists;
  `mutation-testing-guardian` when tests look green but weak; `playwright-skill`
  when UI behavior needs browser proof; `exploring-tools` when callers and
  ownership are unclear.

Do not duplicate their work. Use this skill as the refactor safety spine and
pull specialist guidance only for the part that needs it.

## Acceptance Bar

Accept only when all are true:

- Behavior contract is preserved or intentional behavior change is explicit.
  Relevant tests pass and no baseline failure is made worse. The changed hotspot
  is easier to explain in 30 seconds. New abstractions have domain names and
  clear ownership. Residual risks are named with concrete next checks.

## Final Response Shape

Report:

- hotspot changed and why it mattered; before/after complexity evidence when
  available, or explicit estimate; behavior contract preserved; tests added or
  changed; commands run and results; remaining risks and next hotspot, if
  useful.
