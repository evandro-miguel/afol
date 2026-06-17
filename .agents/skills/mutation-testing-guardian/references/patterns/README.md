---
description: Behavior-focused testing patterns, RIP diagnosis, TypeScript/Bun/React/Python tactics, and practical Stryker/mutmut/Cosmic Ray configuration examples.
metadata:
  tags: "patterns, stryker, mutmut, cosmic-ray, vitest, pytest, react"
---

# Testing Patterns

## Table Of Contents

- [Mutation Operators And Risks](#mutation-operators-and-risks) [RIP
  Diagnosis](#rip-diagnosis) [Boundary Analysis](#boundary-analysis) [Decision
  Tables For Boolean Logic](#decision-tables-for-boolean-logic) [Observable
  Output Assertions](#observable-output-assertions) [Characterization Tests For
  Legacy](#characterization-tests-for-legacy) [Property And Metamorphic
  Tests](#property-and-metamorphic-tests) [TypeScript And Vitest With
  Stryker](#typescript-and-vitest-with-stryker) [Bun Test With Stryker Command
  Runner](#bun-test-with-stryker-command-runner) [React Mutation
  Patterns](#react-mutation-patterns) [Python With mutmut](#python-with-mutmut)
  [Python With Cosmic Ray](#python-with-cosmic-ray) [Triage
  Template](#triage-template) [Killing With Minimal Expressive
  Tests](#killing-with-minimal-expressive-tests)

## Mutation Operators And Risks

| Original | Mutant | Risk simulated |
| --- | --- | --- |
| `a > b` | `a >= b` | Boundary error |
| `a && b` | `a &#124;&#124; b` | Condition too permissive |
| `return true` | `return false` | Rule inversion |
| `price + tax` | `price - tax` | Calculation error |
| `items.filter(fn)` | `items` | Missing filter |
| `user?.id` | `user.id` | Null-safety break |
| `throw new Error()` | no throw | Error path not protected |
| `200` | `500` | HTTP contract drift |

The agent should translate each survivor into a behavioral question.

## RIP Diagnosis

Use this table before writing tests:

| RIP failure | Symptom | Fix |
| --- | --- | --- |
| Reach | `NoCoverage` or untouched mutant | Add test that enters the branch |
| Infect | Test reaches line but state is same | Use boundary input/state |
| Propagate | State differs but output same | Assert nearer output |
| Assert | Output differs but test passes | Strengthen exact assertion |

Do not write a broad test if one missing boundary case is enough.

## Boundary Analysis

Mutation testing is excellent at finding edge gaps. For comparisons, test both
sides and the boundary:

```ts
describe("discount threshold", () => {
  test.each([
    { total: 99, expected: 0 },
    { total: 100, expected: 10 },
    { total: 101, expected: 10 },
  ])("total $total", ({ total, expected }) => {
    expect(discountFor(total)).toBe(expected);
  });
});
```

Python:

```python
@pytest.mark.parametrize(
    ("total", "expected"),
    [(99, 0), (100, 10), (101, 10)],
)
def test_discount_threshold(total, expected):
    assert discount_for(total) == expected
```

## Decision Tables For Boolean Logic

Use a table when mutants change `&&` to `||`, invert booleans, or remove a
condition.

```ts
test.each([
  { active: false, verified: true, blocked: false, expected: false },
  { active: true, verified: false, blocked: false, expected: false },
  { active: true, verified: true, blocked: true, expected: false },
  { active: true, verified: true, blocked: false, expected: true },
])("can checkout %#", (input) => {
  expect(canCheckout(input)).toBe(input.expected);
});
```

Table tests should cover meaningful domain combinations, not every mechanical
permutation.

## Observable Output Assertions

Good assertions observe contract:

```ts
expect(result.status).toBe("approved");
expect(result.total).toBe(1250);
expect(result.errors).toEqual([]);
```

HTTP:

```ts
const response = await app.request("/orders", { method: "POST", body });
expect(response.status).toBe(201);
await expect(response.json()).resolves.toMatchObject({ id: expect.any(String) });
```

React:

```ts
await user.click(screen.getByRole("button", { name: /save/i }));
expect(await screen.findByText(/saved/i)).toBeVisible();
expect(screen.queryByText(/invalid/i)).not.toBeInTheDocument();
```

Python:

```python
with pytest.raises(PermissionError, match="not allowed"):
    approve_refund(user, order)
```

Avoid testing private helper calls unless the helper is itself the public unit.

## Characterization Tests For Legacy

When expected behavior is not documented, freeze current behavior before
refactor:

```ts
it("preserves legacy rounding for mixed tax rates", () => {
  expect(calculateInvoice(legacyFixture)).toEqual({
    subtotal: 1099,
    tax: 91,
    total: 1190,
  });
});
```

Mark characterization when behavior is preserved but not endorsed:

```ts
// Characterization: preserves current rounding until product decides otherwise.
```

Keep comment short and concrete.

## Property And Metamorphic Tests

Use property-based or metamorphic tests when exact output is hard but invariants
are clear.

Examples:

- sorting preserves item set; discounts never make total negative; normalizing
  twice equals normalizing once; adding an unrelated item does not change
  eligibility; order of independent inputs does not affect result.

TypeScript pseudo-shape:

```ts
expect(normalize(normalize(input))).toEqual(normalize(input));
```

Python:

```python
assert normalize(normalize(value)) == normalize(value)
```

## TypeScript And Vitest With Stryker

Install only when project policy allows it. Prefer existing package manager.
Verify local syntax first:

```bash
bunx stryker --help
bunx stryker run --help
```

For `pnpm`, `npm`, or `yarn` projects, use that package manager's exec command
instead of `bunx`.

Base config:

```json
{
  "$schema": "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  "mutate": [
    "src/**/*.{ts,tsx}",
    "!src/**/*.test.{ts,tsx}",
    "!src/**/*.spec.{ts,tsx}",
    "!src/**/__tests__/**",
    "!src/**/*.stories.{ts,tsx}",
    "!src/generated/**"
  ],
  "testRunner": "vitest",
  "checkers": ["typescript"],
  "tsconfigFile": "tsconfig.json",
  "reporters": ["html", "clear-text", "progress", "json"],
  "coverageAnalysis": "perTest",
  "incremental": true,
  "thresholds": {
    "high": 85,
    "low": 75,
    "break": 70
  },
  "vitest": {
    "configFile": "vitest.config.ts",
    "related": true
  }
}
```

Run narrow:

```bash
bunx stryker run --configFile stryker.config.json --mutate "src/domain/pricing.ts"
```

Some projects use `stryker.conf.json`, `stryker.config.ts`, or custom filenames.
Use the existing config first. If the installed version rejects `--configFile`
or `--mutate`, narrow the `mutate` list in a temporary config and follow local
`--help` output.

## Bun Test With Stryker Command Runner

Use when the project uses `bun test` directly and no Vitest runner exists.

```json
{
  "$schema": "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  "mutate": [
    "src/**/*.{ts,tsx}",
    "!src/**/*.test.{ts,tsx}",
    "!src/**/*.spec.{ts,tsx}",
    "!src/generated/**"
  ],
  "testRunner": "command",
  "commandRunner": {
    "command": "bun test"
  },
  "checkers": ["typescript"],
  "tsconfigFile": "tsconfig.json",
  "reporters": ["html", "clear-text", "progress", "json"],
  "coverageAnalysis": "off",
  "incremental": true,
  "timeoutMS": 10000,
  "timeoutFactor": 1.5,
  "thresholds": {
    "high": 80,
    "low": 70,
    "break": null
  }
}
```

Command runner is usually slower and less precise. Keep scope smaller.

## React Mutation Patterns

Survivors often reveal:

- disabled/error/loading states not asserted; button enabled when condition is
  mutated; reducer action missing edge case; hook branch not reached by
  user-level test; form validation assertion too vague.

Prefer user-visible assertions:

```ts
expect(screen.getByRole("button", { name: /submit/i })).toBeDisabled();
await user.type(screen.getByLabelText(/email/i), "bad");
expect(screen.getByText(/invalid email/i)).toBeVisible();
```

Async hook or state mutants usually need Reach and Assert through a user path:

```ts
await user.click(screen.getByRole("button", { name: /save/i }));
expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
expect(await screen.findByText(/saved/i)).toBeVisible();
expect(screen.queryByText(/failed/i)).not.toBeInTheDocument();
```

For hooks with domain logic, extract pure decision logic when possible, then
test hook integration only for state synchronization.

## Python With mutmut

Check installed syntax first because mutmut configuration keys and flags vary
between versions:

```bash
mutmut --help
mutmut run --help
```

Common `pyproject.toml` shape:

```toml
[tool.mutmut]
source_paths = ["src/"]
pytest_add_cli_args_test_selection = ["tests/"]
only_mutate = [
  "src/domain/*",
  "src/services/*"
]
do_not_mutate = [
  "tests/*",
  "src/generated/*",
  "src/migrations/*"
]
mutate_only_covered_lines = true
max_stack_depth = 8
```

Common workflow:

```bash
python -m pytest
mutmut run
mutmut results
mutmut show <mutant-id>
```

If config supports path narrowing:

```bash
mutmut run --paths-to-mutate src/domain/pricing.py
```

If the installed version does not support a listed key or flag, prefer the
existing project config and local `--help` over this example. Do not commit
version-specific config without checking the installed tool.

## Python With Cosmic Ray

Base config:

```toml
[cosmic-ray]
module-path = "src"
timeout = 10.0
excluded-modules = [
  "**/tests/**",
  "**/generated/**",
  "**/migrations/**"
]
test-command = "pytest tests"

[cosmic-ray.distributor]
name = "local"
```

Workflow:

```bash
cosmic-ray init cosmic-ray.toml session.sqlite
cosmic-ray exec cosmic-ray.toml session.sqlite
cosmic-ray report session.sqlite
```

Cosmic Ray is useful when mutmut is too limiting, but it adds setup cost.

## Triage Template

Use one entry per relevant survivor:

```md
### Mutant <id>
- File/function:
- Mutation:
- Status: survived | no coverage | timeout | equivalent | ignored
- RIP diagnosis:
- Risk:
- Decision:
- Test/code change:
- Residual risk:
```

## Killing With Minimal Expressive Tests

A good mutant-killing test:

- names the behavior; uses the smallest meaningful input; asserts exact
  observable output; fails on the mutant and passes on original code; does not
  mock the unit under test; remains valuable even if mutation tool is removed.

If a test exists only to satisfy a tool and does not describe behavior, rewrite
it or skip it.
