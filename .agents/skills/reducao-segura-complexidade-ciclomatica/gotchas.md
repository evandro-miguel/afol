---
description: Anti-gaming rules, false reductions, stop signs, and acceptance checks for complexity reduction work.
metadata:
  tags: "gotchas, anti-gaming, refactoring, complexity"
---

# Gotchas

## False Reductions

Do not accept a refactor just because a metric decreased.

False reductions include:

- splitting a function into vague helpers with no domain meaning; replacing
  simple conditionals with a pattern framework; pushing rules into config that
  is harder to validate; spreading one decision across many files; adding casts
  to silence TypeScript; replacing explicit branches with dynamic lookup that
  hides missing cases; moving state from component to global store without
  reducing state space; increasing mocks required by tests; deleting edge-case
  tests because they are inconvenient.

Ask:

```text
Can a future agent find the rule faster?
Can the behavior be tested with fewer mocks?
Are invalid states harder to represent?
Did we reduce mental paths, not just line count?
```

## Complexity Essential To Domain

Some complexity is real business complexity. Do not erase it. Make it explicit:

- use a named decision table; use a state machine or discriminated union; write
  table tests for every meaningful branch; document invariants in a short
  comment only where code cannot express them; isolate the rule in one owned
  module.

Good outcome: complex rule remains complex, but now it is named, tested, and
localized.

## Abstraction Budget

Create an abstraction only when it pays rent:

- removes meaningful duplication; exposes a domain concept; isolates side
  effects; makes tests simpler; matches an existing local pattern.

Reject abstractions that:

- are used once and live far from the caller; have generic names; require
  callers to understand hidden lifecycle/order; increase import graph coupling;
  create new extension points without current need.

## Test Safety Traps

Bad test changes during refactor:

- snapshot-only tests for business rules; assertions such as `toBeTruthy()`
  where exact output matters; mocks of the function under test; tests that
  duplicate the implementation logic; broad setup that hides the input
  responsible for the branch; removal of edge cases because the new structure
  makes them awkward.

Better:

- assert public return, response, thrown error, persisted value, event, or DOM;
  use table tests for branches; keep one test per meaningful domain edge; add
  regression test before changing code that previously had a bug.

## TypeScript Traps

Watch for:

- `any` spreading from a boundary into core logic; `unknown` accepted without
  narrowing; `as` casts added to satisfy refactor; `!` added after moving code;
  too many generics to model simple data; conditional types that only one
  function understands; type and runtime schema divergence.

If type complexity rises, the patch may be worse even when branch count falls.

## React Traps

Watch for:

- effects used for internal data transformation; redundant state copied from
  props; custom hook that hides fetch, tracking, parsing, validation, and state;
  reducer added without real transition complexity; component split that forces
  prop drilling and duplicate branching.

React simplification should reduce impossible UI states and make user behavior
tests more direct.

## Bun/Python Boundary Traps

Watch for:

- env reads in pure rule functions; filesystem/database/network access mixed
  with classification logic; handler returning many status codes from many
  nested branches; Python truthiness changes such as `if value` replacing
  explicit `is None`; dictionary dispatch replacing ordered fallthrough rules.

Keep IO at the edge and domain decisions testable without global mocks.

## Stop Signs

Stop before editing when:

- no test or contract can characterize a critical hotspot; public behavior may
  change but user asked for refactor only; required migration is larger than
  requested scope; baseline failure hides target validation; hotspot is
  security, money, authorization, or data deletion logic and tests are weak.

Stop after first patch when:

- next improvement requires architecture change; complexity metric is already
  acceptable and further changes reduce clarity; validation cost rises faster
  than risk reduction; reviewer would need domain owner decision.

## Review Checklist

Before final answer:

- [ ] Target hotspot named. [ ] Baseline known. [ ] Behavior contract preserved.
  [ ] Tests cover critical branches. [ ] No unsafe casts or weak mocks added. [
  ] No unrelated formatting churn. [ ] Complexity moved toward named domain
  concepts. [ ] Commands and residual risk reported.
