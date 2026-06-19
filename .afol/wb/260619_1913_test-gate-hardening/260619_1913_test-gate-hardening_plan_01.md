# Plan: test-gate-hardening

- Created by native CLI workbench lifecycle.

## Native Command Metadata

- intent: delivery
- task: Harden `coverage:check` so release validation cannot pass on only the `All files` rollup.
- task: Wire `smoke:clean` into `validate:release` and assert that release gate contract in tests.
- task: Finish with AFOL strict validation, evidence, and session close.

## Objective

- Make release validation reject misleading global-only coverage and require a clean-checkout smoke in the release lane.

## Scope

- In scope:
  - `cli/dev/coverage-check.ts`
  - `cli/tests/coverage-check.test.ts` or the smallest existing test surface that can prove the coverage gate behavior
  - `cli/tests/release-toolchain.test.ts`
  - `package.json`
  - `.afol/wb/260619_1913_test-gate-hardening/**`
- Out of scope:
  - unrelated product code
  - legacy `.agents` runtime surfaces
  - broad repo cleanup outside the gate path

## Execution Contract

- Each task must be executable now.
- T-01 proves the coverage gate fails when per-file coverage is weak even if the aggregate row looks acceptable.
- T-02 wires `smoke:clean` into `validate:release` and protects the script contract with a test.
- T-03 runs AFOL validation and strict closure, then records evidence before `done`/`close`.

## Delivery Strategy

1. T-01 coverage gate hardening.
   - Update `cli/dev/coverage-check.ts` so default release coverage checks actual file rows instead of trusting the `All files` summary alone.
   - Add or extend a focused test surface, preferably `cli/tests/coverage-check.test.ts`, to prove the gate fails on low per-file coverage and still supports the targeted include path.
   - Commands: `bun test cli/tests/coverage-check.test.ts cli/tests/release-toolchain.test.ts`.
   - Outcome: the default gate is behaviorally strict and has a regression test.
2. T-02 release smoke gate wiring/tests.
   - Update `package.json` so `validate:release` includes `bun run smoke:clean` in the release sequence.
   - Extend `cli/tests/release-toolchain.test.ts` to assert the new release contract and keep the existing security/coverage assertions intact.
   - Commands: `bun test cli/tests/release-toolchain.test.ts`; `bun run validate:release` if the release lane remains tractable after the change.
   - Outcome: the release script now requires the clean-checkout smoke and the test guards the contract.
3. T-03 validation/strict closure.
   - Run `afol validate project` before closure.
   - Record evidence for the task-level validations with `afol evidence`.
   - Finish with `afol verify-tasks .afol/wb/260619_1913_test-gate-hardening --strict` and `afol close --session 260619_1913_test-gate-hardening`.
   - Outcome: the session closes only after task evidence and task state agree.

## Critical Dependencies

- Tools: `afol`, `bun`
- Skills: `agentic-folder-sys`, `code-discovery`, `caveman`
- Verification surface: `bun test cli/tests/coverage-check.test.ts cli/tests/release-toolchain.test.ts`, `bun run validate:release`, `afol validate project`, `afol verify-tasks .afol/wb/260619_1913_test-gate-hardening --strict`

## Risks And Mitigations

- Risk: changing coverage selection may make the release lane fail on previously hidden low-coverage files. Mitigation: keep the change narrow, add the regression test first, and verify the failure mode with the focused test.
- Risk: adding `smoke:clean` can lengthen release validation or expose lockfile/build assumptions. Mitigation: protect the script contract in `cli/tests/release-toolchain.test.ts` before broad validation and keep the smoke step isolated in `validate:release`.
- Risk: closure can stall on task/evidence mismatch. Mitigation: record evidence per task before calling `done`, then use `afol verify-tasks --strict` as the final gate.

## Verification Plan

- Unit: `bun test cli/tests/coverage-check.test.ts cli/tests/release-toolchain.test.ts`
- Release gate: `bun run validate:release`
- AFOL validation: `afol validate project`
- AFOL strict closure: `afol verify-tasks .afol/wb/260619_1913_test-gate-hardening --strict` and `afol close --session 260619_1913_test-gate-hardening`

## Output Contract

- Changed paths only from `.afol/wb/260619_1913_test-gate-hardening/**`
- Commands run with pass/fail status
- Evidence IDs for each completed task
- Any blockers that keep the session open

## Closure Criteria

- Every task is marked done only after passed evidence exists.
- Delivery notes identify the changed files and verification result.
