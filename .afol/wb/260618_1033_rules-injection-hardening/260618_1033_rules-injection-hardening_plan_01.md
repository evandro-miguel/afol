---
doc_type: plan
id: "260618_1033_rules-injection-hardening_plan_01"
theme: "rules-injection-hardening"
status: complete
owners: ["orchestrator"]
created_at: "2026-06-18T14:36:16Z"
updated_at: "2026-06-18T14:46:30Z"
---

# Plan: rules-injection-hardening

## Objective

- Harden contextual rule injection so first-use state cannot race and missing rule markdown cannot be persisted as injected content.

## Execution Contract

- Keep the change inside the AFOL workbench session and the rules/context path.
- Do not edit `.agents/rules/**` or any product rule markdown.
- Keep resolver limits configurable through existing AFOL config.
- Reuse existing AFOL primitives before adding new storage helpers.
- Execution mode: sequential.

## Scope

- In scope: `cli/services/rules/injection.ts`, `cli/tests/context-system.test.ts`, and session bookkeeping only if evidence needs it.
- In scope if needed for the lock path: `cli/services/io/atomic.ts` or a minimal lock helper under `cli/services/io/`.
- Out of scope: rule markdown edits, `.agents/runtime`, `.agents/scripts`, broader context-routing refactors, and config limit changes.

## Facts

- `resolveAndRecordRuleInjection` currently reads `.afol/data/rules/injection-state.json`, mutates it in memory, and writes it back without a lock.
- `readRuleContent` returns `""` when the markdown path is missing, so a missing file can be recorded as an injected zero-length rule.
- Resolver limits already come from `.agents/config.json`, so hardening should preserve that configurability.
- `atomicWriteText` and `withSessionLock` already exist and can be reused.

## Assumptions

- Optional missing rules should be omitted with a reason.
- Required missing rules should fail before state is written.
- The critical section must cover read, merge, and write, not just the final write call.

## Delivery Strategy

1. Serialize state updates around `resolveAndRecordRuleInjection`, using a file-anchored lock or equivalent AFOL-safe lock and atomic state writes so concurrent first-use cannot duplicate or drop injections. Target: `cli/services/rules/injection.ts`, with reuse from `cli/services/io/atomic.ts` or `cli/services/io/session-lock.ts` if the executor can fit the behavior into existing primitives. Validation: add a regression that calls first-use twice for the same identity and proves only one injected record is written.

2. Split missing-content handling from empty-content handling so a missing rule markdown path is treated as stale input, not as injected content. Target: `cli/services/rules/injection.ts`. Validation: add regression coverage for one optional missing rule that is omitted and one required missing rule that fails without persisting state.

3. Extend the existing context-system tests to cover the state-race and missing-file branches, then run the narrow test file, typecheck, and AFOL project validation. Target: `cli/tests/context-system.test.ts`. Validation: `bun test cli/tests/context-system.test.ts`, `bun run typecheck`, `afol validate project`.

## Risks

- A session-only lock would still leave cross-process races if the same state file can be written from different terminals.
- If missing rule files are only warned about for optional rules, required rules could still leave stale state unless the failure happens before persistence.
- If the regression only covers the happy path, the duplicate-injection bug can return after refactoring.

## Reuse

- `cli/services/io/atomic.ts` for atomic text writes.
- `cli/services/io/session-lock.ts` as the locking pattern reference.
- `cli/tests/context-system.test.ts` for the existing rule-injection coverage.

## Verification Plan

- Unit: `bun test cli/tests/context-system.test.ts`
- Typecheck: `bun run typecheck`
- AFOL: `afol validate project`

## Result

- Implemented locked, atomic rule-injection state writes.
- Missing optional rule markdown is omitted without persisting a fake injection.
- Missing required rule markdown, corrupt injection state, and invalid indexed
  rule metadata fail loudly before state persistence.
- Documentation was updated in `docs/afol-runtime-reference.md`.
- Final validation passed with `bun test`, `bun run typecheck`,
  `./afol validate project`, `./afol verify-tasks --strict`, and
  `git diff --check`.
