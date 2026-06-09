---
doc_type: plan
id: 260531_2236_benchmark-dev-lane_plan_01
theme: benchmark-dev-lane
status: active
created_at: '2026-05-31T23:46:29-03:00'
updated_at: '2026-05-31T23:46:29-03:00'
roadmap_feature: F-11
parent_spec: 260521_0110_validation-ci-and-benchmarks_spec_01
---

# Plan: benchmark-dev-lane

- Created by native CLI workbench lifecycle.
- Feature: F-11
- Parent spec: 260521_0110_validation-ci-and-benchmarks_spec_01

## Objective

- Keep benchmarking as a development-only regression lane.
- Reuse the existing F-11 benchmark system.
- Do not add a new runner or repo root unless the audit proves it is required.

## Scope

- In scope: contract audit, smallest docs/code changes, validation, strict WB verification, closeout.
- Out of scope: heavy tests, new benchmark runner/root, product edits outside the existing F-11 surfaces.

## Delivery Strategy

1. Contract audit
   - Check the F-11 spec, `cli/main.ts` validation routing, `.agents/data/benchmarks/README.md`, `registry.json`, and current lane wording.
   - Outcome: exact change list and a no-new-runner/root decision.
2. Smallest change set
   - Update only the docs/code lines needed to say benchmark use is a selective dev regression lane, not daily production use.
   - Keep the existing F-11 benchmark system intact unless the audit shows a hard gap.
3. Validation
   - Run `bun run typecheck`.
   - Run `bun test cli/tests/validation.test.ts`.
   - Run `bun run cli/main.ts v --json`.
   - Run `bun run cli/main.ts v bench --pack cli-kernel-local --json`.
   - If docs changed, run `just lint`.
   - Do not run heavy tests.

## Risks and Mitigations

- Risk: the lane drifts into a new contract or new root. Mitigation: keep edits inside existing F-11 surfaces unless the audit proves a gap.
- Risk: docs and CLI wording diverge. Mitigation: validate the selector JSON and lint docs when touched.
- Risk: benchmark use is read as daily production gating. Mitigation: make the selective-regression wording explicit.

## Verification Plan

- Typecheck: `bun run typecheck`
- Validation tests: `bun test cli/tests/validation.test.ts`
- Selector JSON: `bun run cli/main.ts v --json`
- Benchmark pack JSON: `bun run cli/main.ts v bench --pack cli-kernel-local --json`
- Docs lint if touched: `just lint`
- WB verification after tasks complete: `./.agents/agents verify-tasks --strict`
- WB closeout after strict verification passes: `./.agents/agents session close --session 260531_2236_benchmark-dev-lane`

## Progress

- [x] 2026-06-01 - Audited the F-11 benchmark contract and lane wording.
- [x] 2026-06-01 - Applied the smallest docs/code edits in existing F-11 surfaces.
- [x] 2026-06-01 - Ran validation commands and captured outputs.

## Concrete Steps

- Keep benchmarking as a development-only regression lane.
- Reuse the existing F-11 benchmark system.
- Do not add a new runner or repo root unless the audit proves it is required.

## Validation and Acceptance

- `bun run typecheck`
- `bun test cli/tests/validation.test.ts`
- `bun run cli/main.ts v --json`
- `bun run cli/main.ts v bench --pack cli-kernel-local --json`
- `just lint`
