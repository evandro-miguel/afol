# Plan: refactor-typed-validation

- Created by native CLI workbench lifecycle.
- Workbench session `260617_0801_refactor-typed-validation`
- Planning task `T-01`

## Scope

- This plan stays under `.afol/wb/260617_0801_refactor-typed-validation/**`.
- Future implementation tasks may edit only the files named in their task entry.
- Forbidden surfaces for this refactor:
  - `docs/**`
  - `.agents/runtime`
  - `.agents/scripts`
  - `.agents/wb`
  - `.agents/z-arq`
  - any file not listed in the active task entry
- If a task needs a wider edit, stop and record the mismatch before expanding scope.

## Execution Plan

### T-01: Plan governed refactor execution in `.afol/wb`

- Allowed files:
  - `.afol/wb/260617_0801_refactor-typed-validation/260617_0801_refactor-typed-validation_plan_01.md`
  - `.afol/wb/260617_0801_refactor-typed-validation/260617_0801_refactor-typed-validation_task_01.md` only if the state board needs a consistency fix
- Tests:
  - `sed -n '1,260p' .afol/wb/260617_0801_refactor-typed-validation/260617_0801_refactor-typed-validation_plan_01.md`
- Risk:
  - Plan drift can hide later scope creep if allowed files are not explicit.
- Rollback:
  - Restore the plan file to the prior revision if the task board or scope disagrees with the plan.

### T-02: Refactor validate routing into typed invocation

- Allowed files:
  - `cli/main.ts`
  - `cli/validate/command.ts`
  - `cli/tests/kernel.test.ts`
  - `cli/tests/router.test.ts`
  - `cli/tests/validate-command.test.ts`
- Tests:
  - `bun test cli/tests/kernel.test.ts cli/tests/router.test.ts cli/tests/validate-command.test.ts`
- Risk:
  - Typed routing can change command resolution or alias behavior if the kernel and router disagree.
- Rollback:
  - Revert the typed routing changes and keep the existing validate command surface unchanged.

### T-03: Refactor update operations into discriminated union

- Allowed files:
  - `cli/services/update/check.ts`
  - `cli/commands/update.ts`
  - `cli/tests/update-command.test.ts`
  - `cli/tests/local-state-indexes.test.ts`
- Tests:
  - `bun test cli/tests/update-command.test.ts cli/tests/local-state-indexes.test.ts`
- Risk:
  - A union change can break `check` vs `apply` behavior or lose local-state coverage.
- Rollback:
  - Restore the prior operation shape and command wiring if the update flow regresses.

### T-04: Tighten project benchmark validator types

- Allowed files:
  - `cli/services/project-benchmark/validate.ts`
  - `cli/commands/project-benchmark.ts` only if command wiring needs a type adjustment
  - `cli/tests/project-benchmark-validation.test.ts`
  - `cli/tests/project-benchmark-command.test.ts`
- Tests:
  - `bun test cli/tests/project-benchmark-validation.test.ts cli/tests/project-benchmark-command.test.ts`
  - `bun run validate:project-benchmarks`
- Risk:
  - Narrower guards can reject valid benchmark inputs or let malformed payloads through.
- Rollback:
  - Revert validator guard tightening and keep the prior accepted input shape.

### T-05: Refactor workbench lifecycle and verify helpers

- Allowed files:
  - `cli/services/workbench/lifecycle.ts`
  - `cli/services/workbench/verify.ts`
  - `cli/tests/workbench-lifecycle.test.ts`
  - `cli/tests/workbench-verify.test.ts`
- Tests:
  - `bun test cli/tests/workbench-lifecycle.test.ts cli/tests/workbench-verify.test.ts`
- Risk:
  - Helper extraction can shift state transitions, verification counts, or session-file handling.
- Rollback:
  - Restore the original lifecycle/verify helper boundaries if task state or evidence handling changes.

### T-06: Run final validation and close issues

- Allowed files:
  - no code edits
- Tests:
  - `afol verify-tasks --strict`
  - `afol validate project`
  - `bun run typecheck`
  - `bun test`
  - `bun run validate:release`
- Risk:
  - A green unit suite can still leave AFOL governance or local-state drift unresolved.
- Rollback:
  - Do not close the session; fix the failing task or validation first, then rerun the same gate set.

## Validation Strategy

- Prefer the narrow task-specific test command first.
- Broaden to the task's named command only when the slice depends on CLI wiring or validation registration.
- Keep all evidence tied to the exact command that was run.

## Closure Gate

- T-01 is done only after this plan is reviewed, evidence is recorded for the review command, and the session is started cleanly.
- T-02..T-05 are done only after their task-scoped tests pass and the touched files stay within the allowed file list.
- T-06 is done only after every gate above passes and the repo is clean except for the governed `.afol/wb/260617_0801_refactor-typed-validation/**` artifacts.
- Final closeout sequence:
  - record evidence for the plan review command
  - mark `T-01` done
