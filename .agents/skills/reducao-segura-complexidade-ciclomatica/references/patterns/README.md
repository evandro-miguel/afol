---
description: Refactoring patterns for reducing nesting, branch chains, boolean soup, mixed IO, TypeScript type complexity, Bun handlers, React state, and Python control flow.
metadata:
  tags: "patterns, refactoring, typescript, bun, react, python"
---

# Refactoring Patterns

## Table Of Contents

- [Pattern Selection Table](#pattern-selection-table) [Deep
  Nesting](#deep-nesting) [`switch` Or `if` Chain By
  Type](#switch-or-if-chain-by-type) [Hard Boolean
  Conditions](#hard-boolean-conditions) [Mixed Validation, Transformation, And
  IO](#mixed-validation-transformation-and-io) [Boolean Flags](#boolean-flags)
  [Duplicated Business Rules](#duplicated-business-rules) [Error
  Handling](#error-handling) [Async Flow](#async-flow) [TypeScript-Specific
  Rules](#typescript-specific-rules) [Bun Handler Rules](#bun-handler-rules)
  [React Rules](#react-rules) [Python Rules](#python-rules) [Test Patterns For
  Safe Refactor](#test-patterns-for-safe-refactor) [Good Extraction
  Checklist](#good-extraction-checklist)

## Pattern Selection Table

<!-- markdownlint-disable MD013 -->

| Symptom | First move | Avoid |
| --- | --- | --- |
| Deep nesting | Guard clauses and early returns | Hiding nested branches in vague helpers |
| `switch`/`if` chain by type/status | Decision map, discriminated union, strategy object | Dynamic magic when explicit table is clearer |
| Hard boolean condition | Name predicates and split domain concepts | Boolean algebra golf |
| Validation + transform + IO in one function | Pure core + thin shell | Shared "manager" object with every concern |
| Boolean flags change behavior | Separate functions or option object with named mode | More flags |
| Duplicated business rule | One named domain function/schema | Generic `utils` dumping ground |
| Inconsistent errors | Small error mapping layer | Catch-all swallowing |
| Async flow hard to follow | Sequential named steps, explicit boundaries | Hidden concurrent side effects |
| React state explosion | Derive state, reducer/state machine, custom hook | More effects |
| TypeScript type maze | Discriminated unions, runtime schemas at boundaries | `any`, unsafe casts, overload sprawl |

<!-- markdownlint-enable MD013 -->

## Deep Nesting

Prefer guard clauses when they express preconditions or terminal states.

```ts
function priceFor(user: User, cart: Cart) {
  if (!user.active) return 0;
  if (cart.items.length === 0) return 0;
  if (user.role === "staff") return staffPrice(cart);

  return customerPrice(user, cart);
}
```

Use extraction only when the extracted function has a real name:

- good: `isEligibleForRenewal`, `buildInvoiceLines`, `normalizeSearchQuery`;
  bad: `processData`, `handleStuff`, `checkThings`, `doValidation`.

## `switch` Or `if` Chain By Type

For TypeScript, prefer discriminated unions when the domain has known variants.

```ts
type Payment =
  | { kind: "card"; last4: string }
  | { kind: "pix"; key: string }
  | { kind: "cash" };

function label(payment: Payment): string {
  switch (payment.kind) {
    case "card":
      return `Card ${payment.last4}`;
    case "pix":
      return `Pix ${payment.key}`;
    case "cash":
      return "Cash";
  }
}
```

For repetitive value-to-action logic, use a typed table when it improves
visibility:

```ts
const statusLabels = {
  draft: "Draft",
  paid: "Paid",
  canceled: "Canceled",
} satisfies Record<OrderStatus, string>;
```

Keep `switch` when it is the clearest explicit decision table and is already
exhaustive.

## Hard Boolean Conditions

Name predicates by domain rule, not implementation detail.

```ts
const hasVerifiedContact = user.emailVerified || user.phoneVerified;
const isAllowedRegion = allowedRegions.includes(user.region);

if (hasVerifiedContact && isAllowedRegion && !user.suspended) {
  return approve(user);
}
```

For repeated combinations, create a decision table test before refactoring.

```ts
test.each([
  { active: false, paid: true, expected: "blocked" },
  { active: true, paid: false, expected: "pending-payment" },
  { active: true, paid: true, expected: "ready" },
])("classifies account", ({ active, paid, expected }) => {
  expect(classifyAccount({ active, paid })).toBe(expected);
});
```

## Mixed Validation, Transformation, And IO

Use a pure-core/thin-shell split:

```text
handler -> parse input -> call pure domain function -> execute IO -> map response
```

Example shape:

```ts
export function planInvoice(input: InvoiceInput): InvoicePlan {
  const valid = validateInvoiceInput(input);
  return buildInvoicePlan(valid);
}

export async function postInvoice(req: Request) {
  const input = await req.json();
  const plan = planInvoice(input);
  const saved = await invoiceRepo.save(plan);
  return Response.json(saved, { status: 201 });
}
```

The pure function gets direct tests. The handler gets a small contract test.

## Boolean Flags

Replace flag-controlled behavior with named entry points when callers already
know intent.

```ts
createDraftInvoice(input);
publishInvoice(input);
previewInvoice(input);
```

Use an options object only when combinations are valid domain states:

```ts
type InvoiceMode = "draft" | "publish" | "preview";
```

If every mode changes many branches, consider a strategy object or state
machine, but only after tests characterize each mode.

## Duplicated Business Rules

Extract the rule once with a domain name and place it near the owning domain.

```ts
function isRefundWindowOpen(order: Order, now: Date): boolean {
  return differenceInDays(now, order.paidAt) <= 30 && !order.refundedAt;
}
```

Do not create a generic helper unless multiple domains share the exact same
concept for the same reason.

## Error Handling

Normalize errors at boundaries:

- domain layer returns typed result or throws domain-specific errors; handler
  maps domain errors to HTTP responses; logging happens once at the edge; tests
  assert public error code/message, not internal stack details.

```ts
if (error instanceof PaymentDeclinedError) {
  return Response.json({ code: "payment_declined" }, { status: 402 });
}
```

## Async Flow

Make ordering and concurrency explicit.

```ts
const account = await loadAccount(id);
const plan = buildPlan(account, input);
const [saved, audit] = await Promise.all([
  savePlan(plan),
  writeAuditEvent(plan),
]);
```

Use `Promise.all` only when operations are independent. Keep sequential code
sequential when order carries meaning.

## TypeScript-Specific Rules

- Prefer narrowing `unknown` at boundaries instead of passing it inward. Use
  discriminated unions for domain variants. Use `satisfies` for static maps that
  must stay exhaustive. Use runtime schemas at IO boundaries when the project
  already uses Zod, Valibot, JSON Schema, or equivalent. Avoid `any`, broad
  `as`, non-null assertions, and clever conditional types unless they remove
  more complexity than they add. Replace many overloads with a discriminated
  input object when calls are domain-mode based.

Runtime schema boundary:

```ts
const parsed = InvoiceInputSchema.parse(await request.json());
const plan = planInvoice(parsed);
```

## Bun Handler Rules

Keep handlers thin:

```text
request -> parse -> authorize -> domain function -> repo/service -> response
```

Move these out of handlers when they grow:

- business decisions; repeated status-code mapping; env parsing;
  filesystem/database details; cache key construction; validation schemas.

Centralize config once:

```ts
export const config = {
  stripeKey: requiredEnv("STRIPE_KEY"),
  webhookSecret: requiredEnv("WEBHOOK_SECRET"),
};
```

Test the domain function with `bun test` or the repo runner. Test the handler
only for request/response contracts and edge cases.

## React Rules

Use React complexity checks:

- state that can be derived from props or existing state should not be state;
  effects are for synchronization with external systems, not internal data
  transformation; render branches with repeated layout often want smaller
  components; hooks should expose clear state/actions, not hide unrelated side
  effects.

Before adding state, ask:

```text
Can it be computed during render?
Can it be represented by fewer fields?
Can impossible states be made impossible?
```

Use reducer when transitions matter:

```ts
type State =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "error"; message: string }
  | { status: "saved" };
```

Test React behavior through visible output and user interactions. Avoid tests
that assert private hook internals when DOM behavior is the contract.

## Python Rules

Useful tools:

```bash
radon cc -s -a .
ruff check . --select C901
python -m pytest
```

Effective Python patterns:

- guard clauses for preconditions; dictionary dispatch for simple
  value-to-function maps; dataclasses or Pydantic models for structured domain
  inputs; small pure functions for calculations and classification;
  `pytest.mark.parametrize` for branch tables; context managers or boundary
  adapters for IO.

Dictionary dispatch:

```python
class UnknownOrderStatusError(ValueError):
    pass


handlers = {
    "draft": handle_draft,
    "paid": handle_paid,
    "canceled": handle_canceled,
}

handler = handlers.get(status)
if handler is None:
    raise UnknownOrderStatusError(status)

return handler(order)
```

Keep an `if` chain when rules have meaningful ordered fallthrough. Clarity wins
over novelty.

## Test Patterns For Safe Refactor

Characterization test:

```ts
it("preserves legacy discount behavior for edge cases", () => {
  expect(calculateDiscount({ tier: "gold", total: 99 })).toBe(5);
  expect(calculateDiscount({ tier: "gold", total: 100 })).toBe(10);
});
```

Invariant test:

```ts
expect(total).toBeGreaterThanOrEqual(0);
expect(result.items.every((item) => item.quantity > 0)).toBe(true);
```

React user behavior:

```ts
await user.click(screen.getByRole("button", { name: /save/i }));
expect(await screen.findByText(/saved/i)).toBeVisible();
```

Python table test:

```python
@pytest.mark.parametrize(
    ("status", "expected"),
    [("draft", False), ("paid", True), ("canceled", False)],
)
def test_can_refund(status, expected):
    assert can_refund(order_with_status(status)) is expected
```

## Good Extraction Checklist

An extraction is good when:

- name describes a domain concept; inputs are explicit; output is easy to test;
  side effects are absent or isolated; caller reads more linearly afterward; no
  new shared dependency is created without need.

An extraction is bad when:

- it moves the same confusion elsewhere; it needs five boolean parameters; it
  hides IO; it makes tests mock more; it creates a generic helper before reuse
  exists.
