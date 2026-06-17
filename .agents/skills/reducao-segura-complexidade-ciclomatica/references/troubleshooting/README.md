---
description: Recovery playbook for failed baselines, unclear behavior, validation failures, metric gaming, high-risk hotspots, React state regressions, and TypeScript/Python refactor issues.
metadata:
  tags: "troubleshooting, refactoring, validation, complexity"
---

# Troubleshooting

## Fast Diagnosis Table

<!-- markdownlint-disable MD013 -->

| Symptom | Likely cause | Action |
| --- | --- | --- |
| Baseline fails before edits | Existing repo issue | Record it, narrow validation, do not fix unrelated failures |
| Complexity score falls but code feels worse | Metric gaming | Revert/simplify abstraction; optimize readability and tests |
| Tests pass but behavior uncertain | Weak characterization | Add focused behavior tests before more refactor |
| Typecheck now needs casts | Type model got worse | Improve narrowing/schema; avoid `any`, broad `as`, and `!` |
| React effect loop appears | State/effect split is wrong | Derive state in render or move sync to one effect |
| Handler tests require many mocks | Domain logic still inside IO shell | Extract pure core and test it directly |
| Python dispatch table obscures order | Ordered branch logic is meaningful | Keep explicit `if` chain with named predicates |
| New helper is reused once | Premature abstraction | Inline or keep local near caller |
| Public API shape changes | Refactor leaked behavior change | Stop and ask/plan migration |
| Performance changes unexpectedly | Algorithm or IO order changed | Add measurement or restore original order |

<!-- markdownlint-enable MD013 -->

## Baseline Already Red

If baseline commands fail before the patch:

1. Capture exact failing command and short failure reason.
2. Run the narrowest test that covers the target if possible.
3. Avoid unrelated repairs unless the target cannot be validated at all.
4. Make the refactor only if it can be proved not to worsen baseline.
5. Report residual risk clearly.

Useful final wording:

```md
Baseline had existing failure in `bun run test`.
Targeted test `...` passed before and after.
This patch did not attempt to fix unrelated failure `...`.
```

## Behavior Is Unclear

Do not invent business rules. Infer contract from:

- current tests; callers and public API usage; schemas and types; docs and route
  contracts; error handling; persisted data shape; recent bugs or issues if
  available.

If still unclear:

- write characterization tests that freeze existing behavior; keep names
  descriptive but not normative beyond evidence; avoid changing edge behavior;
  mark uncertainty in final report.

## Complexity Moved Elsewhere

Bad signs:

- one large function became five vague helpers; business rule spread across
  files; more mocks needed to test the same behavior; function signature gained
  several booleans; type-level cleverness replaced runtime clarity; state moved
  to context/global store without reducing states.

Fix:

1. Inline helpers that do not have domain names.
2. Move pure rules close to owning domain.
3. Collapse flag parameters into explicit modes or separate functions.
4. Keep boundary adapters thin.
5. Prefer a clear decision table over over-engineered polymorphism.

## Validation Fails After Patch

Triage in this order:

1. Is failure related to target behavior?
2. Did a test assert implementation details that should be updated?
3. Did the refactor change error type, message, status, order, or timing?
4. Did async/concurrency order change?
5. Did a TypeScript narrowing or Python truthiness case change?
6. Did React render/effect timing change?

If behavior drift is accidental, fix code. If test was coupled to internals,
update test only after confirming public behavior is unchanged.

## TypeScript Trouble

Problems and corrections:

- `any` introduced: replace with runtime parsing or explicit unknown narrowing.
  `as SomeType` added after refactor: prove shape with guard/schema. non-null
  assertion added: handle absent case or change type to make invariant explicit.
  union not exhaustive: add discriminant and exhaustive switch. conditional type
  grew large: ask whether runtime domain model should be simpler.

Prefer:

```ts
function assertNever(value: never): never {
  throw new Error(`Unhandled variant: ${String(value)}`);
}
```

Use only when the project pattern supports it.

## React Trouble

If refactor causes stale UI, loops, or duplicated requests:

- remove state derived from props/data; compute derived values during render or
  with `useMemo` only for expensive computation; keep effects for external sync;
  keep event handlers responsible for user-triggered changes; test visible
  behavior, not hook internals.

Reducer is useful when:

- transitions are explicit; multiple state fields must change together;
  impossible combinations exist today.

Reducer is not useful when:

- the component just stores simple form fields; transition logic is trivial; it
  hides IO in reducer actions.

## Bun/Python IO Trouble

If tests need global mocks:

- move env parsing to config boundary; inject filesystem/network/database
  adapter at edge; keep domain function pure; test adapter with one
  integration-style case; test domain branches without IO.

If async behavior changes:

- keep previous sequencing unless independence is proven; do not introduce
  parallelism for speed without contract evidence; preserve retry, timeout,
  cancellation, and error order semantics.

## When To Stop

Stop and report instead of pushing further when:

- hotspot is above critical threshold and has no characterization; public
  contract may change; domain rule is ambiguous; baseline is too broken to prove
  safety; refactor needs broad architecture decisions; test additions require
  product decisions; next step would touch unrelated modules.

## Recovery Report

When blocked, report:

```md
## Blocked Complexity Reduction
- Target:
- Blocking fact:
- Evidence:
- Safest next step:
- Risk if proceeding:
```

This is better than shipping a refactor that only looks simpler.
