---
doc_type: "workbench_plan"
id: "260710_1159_typescript-7-toolchain-adoption_plan_01"
session_id: "260710_1159_typescript-7-toolchain-adoption"
theme: "typescript-7-toolchain-adoption"
status: "active"
created_at: "2026-07-10T15:59:23.312Z"
updated_at: "2026-07-10T15:59:23.312Z"
roadmap_feature: "F-21"
feature_id: "F-21"
parent_spec: "260710_1256_typescript-7-toolchain-adoption_spec_01"
task_ids: "T-01,T-02,T-03"
governance_status: "governed"
spec_required: true
pending_spec: false
pending_spec_status: "none"
pending_spec_missing: ""
pending_spec_resolution_hint: "linked to roadmap feature and parent spec"
spec_waiver_reason: ""
---

# Plan: typescript-7-toolchain-adoption

## Outcome

AFOL uses exact TypeScript `7.0.2` for deterministic compile-time validation.
The migration removes the false-positive nightly lane, preserves Bun runtime
behavior, and proves that CI keeps typecheck blocking before release validation.

## Context

The existing `bun run typecheck` is already a blocking CI preflight. The
additional `typecheck:ts7:informative` script catches every compiler failure and
resolves `typescript@next`, which now tracks TypeScript 7.1 nightlies. An
isolated exact `7.0.2` install already passed typecheck, strict library checking,
979 tests, build, frozen install, and clean smoke. Five local measurements
reduced typecheck from approximately 2.764 seconds to 270.8 milliseconds.

F-21 and parent spec
`260710_1256_typescript-7-toolchain-adoption_spec_01` govern this execution.
The new spec supersedes only the TypeScript baseline statement in F-11.

## Scope and Boundaries

In scope:

- Add F-21 and its parent spec to governance-history coverage.
- Pin `devDependencies.typescript` to exact `7.0.2` and update `bun.lock`.
- Remove `typecheck:ts7:informative`.
- Add a focused test for frozen install, blocking typecheck, and CI ordering.
- Run focused, full, release, AFOL, and security validation.

Out of scope:

- Changes to Bun runtime, transpilation, bundling, or `tsconfig.json` without a
  reproduced TypeScript 7 failure.
- Adding typecheck inside `validate:release`.
- TypeScript compiler API adoption.
- Neovim, LazyVim, `tsgo`, mise, or `/home/ozy/00_sys/os` changes.
- Deployment, global installation, commits, or pushes.

## Execution Sequence

### T-01: Finalize the plan and governance coverage

- Preserve this CLI-managed frontmatter and the canonical State Board in the
  task document.
- Add F-21, its parent spec, and its release-validation scenario lane to the
  factory governance-history coverage matrix.
- Extend the focused registry regression test so missing F-21 feature or spec
  coverage fails validation.
- Keep downstream template governance data generic. Regenerate the embedded
  template only if a source-template change makes the check stale.
- Validate with `bun test cli/tests/validate-internals.test.ts` and
  `git diff --check`.

### T-02: Adopt TypeScript 7 and enforce the CI contract

- Pin TypeScript with `bun add --dev --exact typescript@7.0.2` so `package.json`
  and `bun.lock` agree.
- Remove the masked informative lane. Keep the canonical `typecheck` command.
- Add a focused regression test that reads the workflow contract and proves
  frozen install precedes blocking typecheck, which precedes release validation.
- Confirm `validate:release` does not duplicate typecheck.
- Run focused tests, `bun install --frozen-lockfile`, `bun run typecheck`, and a
  `skipLibCheck: false` typecheck before broader validation.

### T-03: Validate, review, and close

- Run static analysis, the full test suite, build, manifest, AFOL project,
  release, clean-smoke, and required security gates.
- Run Gitleaks with redaction over history and the worktree, and scan `bun.lock`
  through the required OSV lane.
- Obtain independent review of the plan, diff, CI contract, dependency pin, and
  validation evidence.
- Fix confirmed findings, rerun the narrow affected gates, attach evidence,
  verify tasks strictly, and close only with no open task.

## Validation Order

```bash
bun test cli/tests/validate-internals.test.ts
bun install --frozen-lockfile
bun run typecheck
bunx tsc --noEmit -p tsconfig.json --skipLibCheck false
bun test cli/tests/release-toolchain.test.ts
bun run lint:biome
bun run lint:oxlint
bun run lint:knip
bun test
bun run build
bun run manifest:check
afol local-state rebuild --json
afol validate project --json
bun run validate:release
bun run smoke:clean
bun run validate:security:required
git diff --check
```

## Rollback

If an unresolved TypeScript 7 regression remains, restore only exact TypeScript
`6.0.3` and regenerate `bun.lock`. Keep the blocking typecheck, CI contract
test, F-21 governance, and removal of the masked nightly lane. Rerun the same
focused and full gates before recording rollback evidence.

## Closure Criteria

- Exact TypeScript `7.0.2` is locked and frozen install is clean.
- The masked nightly lane is absent.
- CI ordering is protected by a focused regression test.
- Focused, full, AFOL, release, smoke, and required security gates pass.
- Independent reviewers report no unresolved blocking finding.
- Every task has passed evidence before `done`, strict task verification passes,
  and the governed session closes cleanly.
