---
description: Bun test runner usage, Jest compatibility, mocks, and snapshots.
metadata:
  tags: "bun, testing, test runner, jest, mocks, snapshots, bun:test"
---

# Bun Test Runner

Fast, built-in, Jest-compatible test runner with TypeScript support.

## Quick Start

```bash
# Run all tests
bun test

# Run with watch mode
bun test --watch

# Run specific file
bun test ./math.test.ts

# Filter by test name
bun test --test-name-pattern "addition"
```

## Writing Tests

### Basic Test

```typescript
import { expect, test } from "bun:test";

test("2 + 2 = 4", () => {
  expect(2 + 2).toBe(4);
});
```

### Test Suites

```typescript
import { describe, expect, test } from "bun:test";

describe("Math operations", () => {
  test("addition", () => {
    expect(1 + 1).toBe(2);
  });

  test("subtraction", () => {
    expect(5 - 3).toBe(2);
  });
});
```

### Async Tests

```typescript
test("async operation", async () => {
  const result = await fetchData();
  expect(result).toBeDefined();
});

test("with promises", () => {
  return fetchData().then(data => {
    expect(data).toBeDefined();
  });
});
```

## Test File Patterns

Bun automatically finds files matching:

- `*.test.{js|jsx|ts|tsx}`
- `*_test.{js|jsx|ts|tsx}`
- `*.spec.{js|jsx|ts|tsx}`
- `*_spec.{js|jsx|ts|tsx}`

## CLI Options

### Filtering

```bash
# Run tests matching filter
bun test math

# Run specific file
bun test ./test/specific-file.test.ts

# Filter by test name
bun test -t "addition"
bun test --test-name-pattern "addition"
```

### Watch Mode

```bash
# Watch for changes
bun test --watch

# Watch specific files
bun test --watch ./src
```

### Timeouts

```bash
# Set per-test timeout (default: 5000ms)
bun test --timeout 10000

# Disable timeout
bun test --timeout 0
```

### Concurrent Execution

```bash
# Run tests concurrently
bun test --concurrent

# Limit concurrency (default: 20)
bun test --concurrent --max-concurrency 4
```

### Bail

```bash
# Stop after first failure
bun test --bail

# Stop after N failures
bun test --bail=10
```

### Randomize

```bash
# Run tests in random order
bun test --randomize

# Use specific seed for reproducibility
bun test --seed 12345
```

### Rerun

```bash
# Run each test multiple times (detect flaky tests)
bun test --rerun-each 100
```

## Lifecycle Hooks

| Hook | Description |
|------|-------------|
| `beforeAll` | Runs once before all tests |
| `beforeEach` | Runs before each test |
| `afterEach` | Runs after each test |
| `afterAll` | Runs once after all tests |

```typescript
import { beforeAll, beforeEach, afterEach, afterAll, test } from "bun:test";

beforeAll(() => {
  console.log("Setup once");
});

beforeEach(() => {
  console.log("Setup before each");
});

afterEach(() => {
  console.log("Cleanup after each");
});

afterAll(() => {
  console.log("Cleanup once");
});
```

## Preload Scripts

```bash
# Run setup before all tests
bun test --preload ./setup.ts
```

```typescript
// setup.ts
import { beforeAll } from "bun:test";

beforeAll(() => {
  // Global setup
});
```

## Mocks

### Mock Functions

```typescript
import { mock, expect, test } from "bun:test";

const random = mock(() => Math.random());

test("mock function", () => {
  const val = random();
  expect(val).toBeGreaterThan(0);
  expect(random).toHaveBeenCalled();
  expect(random).toHaveBeenCalledTimes(1);
});
```

### Jest-style Mocks

```typescript
import { jest, expect, test } from "bun:test";

const random = jest.fn(() => Math.random());

test("jest mock", () => {
  random();
  expect(random).toHaveBeenCalled();
});
```

### Module Mocks

```typescript
import { mock, test } from "bun:test";

mock.module("./math", () => {
  return {
    add: (a: number, b: number) => a + b,
    multiply: mock(() => 42)
  };
});
```

## Snapshots

### Basic Snapshots

```typescript
import { expect, test } from "bun:test";

test("snapshot", () => {
  expect({ a: 1, b: 2 }).toMatchSnapshot();
});
```

### Update Snapshots

```bash
# Update all snapshots
bun test --update-snapshots

# Short form
bun test -u
```

## Matchers

### Equality

```typescript
expect(value).toBe(expected);        // Strict equality
expect(value).toEqual(expected);     // Deep equality
expect(value).not.toBe(expected);    // Negation
```

### Truthiness

```typescript
expect(value).toBeTruthy();
expect(value).toBeFalsy();
expect(value).toBeNull();
expect(value).toBeUndefined();
expect(value).toBeDefined();
```

### Numbers

```typescript
expect(value).toBeGreaterThan(5);
expect(value).toBeGreaterThanOrEqual(5);
expect(value).toBeLessThan(5);
expect(value).toBeLessThanOrEqual(5);
expect(value).toBeCloseTo(0.3, 5);   // Precision
```

### Strings

```typescript
expect(string).toContain("substring");
expect(string).toMatch(/regex/);
expect(string).toHaveLength(10);
```

### Arrays

```typescript
expect(array).toContain(item);
expect(array).toHaveLength(3);
expect(array).toEqual(expect.arrayContaining([1, 2]));
```

### Objects

```typescript
expect(object).toHaveProperty("key");
expect(object).toHaveProperty("key", value);
expect(object).toMatchObject({ a: 1 });
```

### Exceptions

```typescript
expect(() => {
  throw new Error("fail");
}).toThrow();

expect(() => {
  throw new Error("fail");
}).toThrow("fail");

expect(() => {
  throw new Error("fail");
}).toThrow(Error);
```

### Async

```typescript
await expect(promise).resolves.toBe(value);
await expect(promise).rejects.toThrow();
```

## Test Modifiers

### Skip

```typescript
test.skip("skipped test", () => {
  // Won't run
});
```

### Only

```typescript
test.only("only this test", () => {
  // Only this runs
});
```

### Todo

```typescript
test.todo("implement this later");
```

### Concurrent

```typescript
test.concurrent("runs in parallel", async () => {
  // Runs concurrently with other concurrent tests
});
```

### Serial

```typescript
test.serial("runs sequentially", () => {
  // Runs in order even with --concurrent
});
```

### Failing

```typescript
test.failing("expected to fail", () => {
  expect(true).toBe(false);
});
```

### Each

```typescript
test.each([
  [1, 1, 2],
  [2, 2, 4],
  [3, 3, 6]
])("adds %i + %i to equal %i", (a, b, expected) => {
  expect(a + b).toBe(expected);
});
```

## CI/CD Integration

### GitHub Actions

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun test
```

### JUnit XML Reports

```bash
bun test --reporter=junit --reporter-outfile=./bun.xml
```

### Coverage

```bash
# Generate coverage report
bun test --coverage
```

## AI Agent Integration

Bun detects AI environments and reduces output noise:

```bash
# Quiet output for AI agents
CLAUDECODE=1 bun test
AGENT=1 bun test
REPL_ID=1 bun test
```

When enabled:

- Only failures displayed in detail
- Passing tests hidden
- Summary statistics preserved

## Best Practices

1. **Use descriptive test names** - Clear what is being tested
2. **One assertion per test** - Easier to identify failures
3. **Use `beforeEach` for setup** - Clean state between tests
4. **Mock external dependencies** - Isolate unit tests
5. **Use snapshots sparingly** - For complex data structures
6. **Enable concurrent mode** - Faster test runs
7. **Use `--preload`** - Share setup across test files

## Common Patterns

### Testing Async Code

```typescript
test("async with await", async () => {
  const data = await fetchData();
  expect(data).toBeDefined();
});

test("async with resolves", async () => {
  await expect(fetchData()).resolves.toBeDefined();
});

test("async with rejects", async () => {
  await expect(badRequest()).rejects.toThrow();
});
```

### Testing with Mocks

```typescript
import { mock, test, expect, beforeEach } from "bun:test";

const fetchMock = mock();

test("api call", async () => {
  fetchMock.mockReturnValue(Promise.resolve({ json: () => ({ data: [] }) }));

  const result = await apiCall();

  expect(fetchMock).toHaveBeenCalledWith("/api/data");
  expect(result).toEqual({ data: [] });
});
```

### Testing Errors

```typescript
test("throws error", () => {
  expect(() => {
    riskyOperation();
  }).toThrow("Expected error message");
});
```

---

*Source: Official Bun Documentation - bun.com*
