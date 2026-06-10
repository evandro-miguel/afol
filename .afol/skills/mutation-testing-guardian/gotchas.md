---
description: Anti-patterns, false confidence traps, CI gate risks, equivalent mutant rules, and final acceptance checklist for mutation testing work.
metadata:
  tags: "gotchas, mutation-testing, test-quality, ci"
---

# Gotchas

## False Confidence

Mutation testing can still mislead.

Do not trust results when:

- baseline tests fail or flake; mutate scope excludes the risky code; score is
  high but critical survivors remain; tests kill mutants by checking
  implementation details; snapshots are the main oracle; equivalent mutants are
  counted as real failures; generated/log/config code dominates results; command
  runner executes the wrong tests.

Mutation score is a signal. Survivor risk is the decision.

## Over-Mocking

Bad test:

- mocks the function under test; mocks every collaborator, including pure domain
  logic; asserts internal calls instead of public result; passes even when
  return value or response is wrong.

Better:

- mock only external boundaries such as network, database, clock, or filesystem;
  keep domain logic real; assert returned value, response, state, event, or
  visible DOM.

If a test needs many mocks to reach a branch, the production code may need a
pure-core/thin-shell split.

## Snapshot Trap

Snapshots can kill some mutants accidentally and miss important behavior.

Avoid snapshot as the only guard for:

- authorization; money; validation; error contracts; state transitions; API
  response semantics.

Use explicit assertions for critical fields. Snapshot can remain as secondary
context when useful.

## Implementation-Copy Trap

Do not compute expected values by repeating production logic in the test.

Bad:

```ts
const expected = items.filter((item) => item.active).map(toDto);
expect(result).toEqual(expected);
```

Better:

```ts
expect(result).toEqual([
  { id: "item-1", label: "Active item" },
]);
```

Expected data should expose the contract, not mirror the algorithm.

## Vague Assertions

Avoid:

```ts
expect(result).toBeTruthy();
expect(response.ok).toBe(true);
expect(items.length).toBeGreaterThan(0);
```

Prefer exact behavior:

```ts
expect(response.status).toBe(403);
await expect(response.json()).resolves.toMatchObject({ code: "forbidden" });
expect(items).toHaveLength(2);
```

## Equivalent Mutant Rules

Equivalent mutants are not failures, but they require discipline.

Accept equivalence only when:

- boundary cases cannot distinguish behavior; public output is provably
  identical; no side effect, error, timing, or state transition differs;
  rationale is written in report or narrow ignore.

Do not:

- add impossible tests; globally disable mutators to hide one equivalent; ignore
  a mutant because it is inconvenient; leave a security/money survivor as
  "probably equivalent" without proof.

## Ignoring Mutants

Every ignore needs:

- specific file/line or mutator; reason; owner or review path when critical;
  preference for narrowest exclusion.

Valid reasons:

- generated code; migration; equivalent mutant with proof; logging/telemetry not
  part of contract; tool limitation; code slated for deletion with tracked task.

Invalid reasons:

- score target hard to reach; test would take effort; survivor is in a critical
  path but "unlikely"; broad `disable all`.

## CI Gate Trap

Global mutation gates are expensive and brittle in existing repos.

Start with:

- changed critical files; protected modules; informational report; "no new
  critical survivors"; scheduled full run outside PR path.

Avoid:

- making every PR run whole-repo mutation; failing legacy modules on first
  measurement; blocking on equivalent/noisy mutants without triage; thresholds
  that nobody can explain.

## Refactor Trap

When used with complexity reduction:

- mutation before refactor tells whether tests can protect behavior; mutation
  after refactor tells whether protection survived; lower complexity does not
  compensate for new dangerous survivors.

Reject a refactor when:

- critical mutation protection worsens; new tests assert internals; behavior
  contract became less clear; survivors are waved away without triage.

## Tooling Trap

Do not cargo-cult commands. Mutation tools change flags across versions.

Use:

```bash
bunx stryker --help
mutmut --help
cosmic-ray --help
```

Prefer repo-local scripts/config when present. If docs and installed version
disagree, installed version wins for this repo.

## Final Checklist

- [ ] Baseline normal tests are known. [ ] Mutate scope is narrow and justified.
  [ ] Tool/config excludes tests, generated files, stories, migrations. [ ]
  Every relevant survivor is triaged. [ ] Dangerous survivors are killed by
  behavior tests or left as explicit risk. [ ] Equivalent/ignored mutants have
  rationale. [ ] New tests do not over-mock or mirror implementation. [ ] Score
  is reported with survivor risk, not alone. [ ] CI gate, if added, is gradual
  and scoped.
