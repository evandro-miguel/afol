# Plan: contract-hardening-p0

- Created by native CLI workbench lifecycle.

## Native command metadata
- feature_id: F-11
- parent_spec: docs/arc/SPECS/260521_0110_validation-ci-and-benchmarks_spec_01.md
- task: Execute delegated P0/P1 contract hardening: benchmark exits/selectors, strict close, provider-compatible safety, update-template boundary, then verify.

## Execution Plan

- T-01: Orchestrate delegated execution, keep scopes disjoint, collect slice reports.
- T-02: Builder A hardens validation benchmark contracts: failed benchmark exit code, update scope selector, mutation selector paths, focused validation tests.
- T-03: Builder B hardens workbench/file contracts: closeSession strict verify, shared evidence success semantics, file blocked exit code, focused lifecycle/mutation tests.
- T-04: Builder C hardens bootstrap/update contracts: provider-compatible no automatic deletion, update uses embedded template payload rather than downstream `src/project-template`, focused bootstrap/update tests.
- T-05: Verifier audits changes, runs targeted tests first, then release-appropriate gates if targeted checks pass.
- T-06: Fix verifier blockers: update-command TS narrowing and init forwarding for provider cleanup opt-in.
- T-07: Resolve root mirror GitNexus count drift: either restore prior counts or document intentional regeneration.
- T-08: Re-run verifier after T-06/T-07.

## Agent Roster

- Orchestrator: this thread. Owns session, task state, conflict routing, final synthesis. No product-code edits unless unblocking integration.
- Builder A: `build`, write scope `cli/validate/contract.ts`, `cli/tests/validation.test.ts`.
- Builder B: `build`, write scope `cli/services/workbench/**`, `cli/commands/workbench.ts`, `cli/commands/file.ts`, `cli/tests/workbench-*.test.ts`, `cli/tests/mutation-safety.test.ts`.
- Builder C: `build`, write scope `cli/commands/bootstrap.ts`, `cli/services/bootstrap/**`, `cli/services/update/**`, `cli/commands/update.ts`, `cli/tests/bootstrap*.test.ts`, `cli/tests/update-command.test.ts`.
- Verifier: `plan-auditor` after builder results. Owns evidence quality, changed-file audit, missing tests, and final gate recommendation.
- Resolver: `build-error-resolver`, write scope `cli/tests/update-command.test.ts`, `cli/commands/init.ts`, and focused init test file only.
- Scope-cleaner: `worker` or `text-worker`, write scope `AGENTS.md`, `CLAUDE.md` only.

## Constraints

- Use `$caveman` style and selective `$rtk-token-optimization`.
- Run GitNexus impact before editing any function/class/method; report blast radius.
- No overlap outside assigned write scopes without returning to orchestrator.
- Prefer focused tests. Do not run broad release gates until slice tests pass.
- Keep docs changes out of scope unless needed to remove stale test/contract claims.

## Validation

- Builder A: `bun test cli/tests/validation.test.ts` plus live selector/benchmark exit probes.
- Builder B: `bun test cli/tests/workbench-lifecycle.test.ts cli/tests/workbench-verify.test.ts cli/tests/mutation-safety.test.ts`.
- Builder C: `bun test cli/tests/bootstrap.test.ts cli/tests/bootstrap-conflicts.test.ts cli/tests/update-command.test.ts`.
- Verifier: `git status --short`, targeted tests above, `bun run typecheck`, then `./afol validate --json` if typecheck passes.
- Resolver: `bun run typecheck`, `bun test cli/tests/update-command.test.ts`, focused init regression test.
- Re-verifier: targeted test matrix, `bun run typecheck`, `./afol validate --json`.

## Closure Criteria

- Slice reports list files changed, impact checked, tests run, failures, and residual risk.
- No command reports success when payload says failure.
- Provider-compatible no longer removes mutable state without explicit destructive opt-in.
- Update path no longer depends on downstream `src/project-template`.
- Session closes only after strict verification would reject done-without-evidence.
